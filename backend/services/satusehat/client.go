package satusehat

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

var satusehatResourceUUIDPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var satusehatResourceUUIDExtractPattern = regexp.MustCompile(`(?i)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`)
var satusehatInFlightSyncLocks sync.Map

// --- Token cache ---
var (
	tokenCacheMu    sync.Mutex
	cachedToken     TokenResponse
	cachedTokenKey  string // hash of auth_url + client_id to invalidate on config change
	tokenExpiresAt  time.Time
	tokenSafeMargin = 60 * time.Second // refresh 60s before actual expiry
)

// --- Global API rate limiter ---
// SATUSEHAT enforces per-client rate limits. This ensures a minimum gap between
// consecutive HTTP calls to avoid QuotaViolation errors.
var (
	apiThrottleMu      sync.Mutex
	apiLastCallTime    time.Time
	apiCallMinInterval = 350 * time.Millisecond // ~3 req/sec ≈ 180 req/min
)

// throttleSATUSEHATCall must be called before every outgoing HTTP request to
// SATUSEHAT (FHIR, auth, and KFA endpoints). It blocks until enough time has
// elapsed since the previous call.
func throttleSATUSEHATCall() {
	apiThrottleMu.Lock()
	defer apiThrottleMu.Unlock()

	elapsed := time.Since(apiLastCallTime)
	if elapsed < apiCallMinInterval {
		time.Sleep(apiCallMinInterval - elapsed)
	}
	apiLastCallTime = time.Now()
}

type upsertContextKey string

const skipExistingResourceUpsertKey upsertContextKey = "satusehat_skip_existing_resource_upsert"

type TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
}

type ResourceOperationResult struct {
	Method       string         `json:"method"`
	StatusCode   int            `json:"status_code"`
	ResourceType string         `json:"resource_type"`
	ResourceID   string         `json:"resource_id"`
	Location     string         `json:"location,omitempty"`
	ResponseBody map[string]any `json:"response_body,omitempty"`
}

func WithSkipExistingResource(ctx context.Context) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, skipExistingResourceUpsertKey, true)
}

func shouldSkipExistingResourceUpsert(ctx context.Context) bool {
	if ctx == nil {
		return false
	}
	flag, _ := ctx.Value(skipExistingResourceUpsertKey).(bool)
	return flag
}

func RequestAccessToken(ctx context.Context, config Config) (TokenResponse, error) {
	if err := config.EnsureEnabled(); err != nil {
		return TokenResponse{}, err
	}

	cacheKey := config.AuthURL + "|" + config.ClientID

	tokenCacheMu.Lock()
	if cachedTokenKey == cacheKey && cachedToken.AccessToken != "" && time.Now().Before(tokenExpiresAt) {
		token := cachedToken
		tokenCacheMu.Unlock()
		return token, nil
	}
	tokenCacheMu.Unlock()

	token, err := requestAccessTokenRemote(ctx, config)
	if err != nil {
		return TokenResponse{}, err
	}

	tokenCacheMu.Lock()
	cachedToken = token
	cachedTokenKey = cacheKey
	ttl := time.Duration(token.ExpiresIn) * time.Second
	if ttl <= tokenSafeMargin {
		ttl = 5 * time.Minute // fallback if expires_in is very short or 0
	}
	tokenExpiresAt = time.Now().Add(ttl - tokenSafeMargin)
	tokenCacheMu.Unlock()

	return token, nil
}

func requestAccessTokenRemote(ctx context.Context, config Config) (TokenResponse, error) {
	endpoint := strings.TrimRight(config.AuthURL, "/") + "/accesstoken"

	if missing := config.MissingRequiredFields(true); len(missing) > 0 {
		err := fmt.Errorf("konfigurasi SATUSEHAT belum lengkap: %s", strings.Join(missing, ", "))
		RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpoint, Success: false, ErrorMessage: err.Error(), RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials"}})
		return TokenResponse{}, err
	}

	attempts := []struct {
		endpoint string
		authMode tokenAuthMode
		name     string
	}{
		// Keep token fetch deterministic to the known-good SATUSEHAT pattern.
		{endpoint: endpoint + "?grant_type=client_credentials", authMode: tokenAuthForm, name: "form+query"},
	}

	tokenResult := tokenRequestResult{}
	authMethod := "form+query"
	endpointUsed := attempts[0].endpoint
	hasHTTPResult := false
	var lastNetworkErr error

	for _, attempt := range attempts {
		result := sendTokenRequest(ctx, attempt.endpoint, config.ClientID, config.ClientSecret, attempt.authMode)
		if result.Err != nil {
			lastNetworkErr = result.Err
			continue
		}

		hasHTTPResult = true
		tokenResult = result
		authMethod = attempt.name
		endpointUsed = attempt.endpoint

		if result.StatusCode < http.StatusBadRequest {
			break
		}

		// Stop fallback chain on edge-level 403 HTML responses.
		// Additional auth-mode attempts rarely help and may intensify temporary blocking.
		if result.StatusCode == http.StatusForbidden {
			contentTypeLower := strings.ToLower(strings.TrimSpace(result.ContentType))
			bodyLower := strings.ToLower(strings.TrimSpace(string(result.Body)))
			if strings.Contains(contentTypeLower, "text/html") || strings.Contains(bodyLower, "<!doctype html") || strings.Contains(bodyLower, "<html") {
				break
			}
		}

		if result.StatusCode != http.StatusUnauthorized && result.StatusCode != http.StatusForbidden {
			break
		}
	}

	if !hasHTTPResult {
		err := lastNetworkErr
		if err == nil {
			err = fmt.Errorf("gagal menghubungi endpoint token SATUSEHAT")
		}
		RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpointUsed, Success: false, ErrorMessage: err.Error(), RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials", "auth_method": authMethod}})
		return TokenResponse{}, err
	}

	if tokenResult.StatusCode >= http.StatusBadRequest {
		message := strings.TrimSpace(string(tokenResult.Body))
		if message == "" {
			message = strconv.Itoa(tokenResult.StatusCode)
		}

		message = strings.Join(strings.Fields(message), " ")
		if len(message) > 240 {
			message = strings.TrimSpace(message[:240]) + "..."
		}

		authHost := "-"
		if parsedURL, parseErr := url.Parse(endpointUsed); parseErr == nil && strings.TrimSpace(parsedURL.Host) != "" {
			authHost = strings.TrimSpace(parsedURL.Host)
		}

		hint := ""
		if tokenResult.StatusCode == http.StatusUnauthorized {
			lowerMessage := strings.ToLower(message)
			if strings.Contains(lowerMessage, "not able to be authenticated") || strings.Contains(lowerMessage, "client_id") || strings.Contains(lowerMessage, "client_secret") || strings.Contains(lowerMessage, "unacceptable") {
				hint = " Kombinasi client_id dan client_secret ditolak SATUSEHAT untuk mode aktif saat ini. Pastikan gunakan credential sandbox untuk mode sandbox (atau credential production untuk mode production), tanpa spasi/karakter tambahan saat menyimpan di Settings Integrasi."
			}
		}
		if tokenResult.StatusCode == http.StatusForbidden {
			lowerMessage := strings.ToLower(message)
			if strings.Contains(lowerMessage, "forbidden") || strings.Contains(lowerMessage, "<!doctype html") || strings.Contains(lowerMessage, "<html") {
				if strings.EqualFold(strings.TrimSpace(config.ActiveMode), ModeSandbox) {
					hint = " Periksa pasangan mode sandbox dengan credential sandbox yang sesuai, auth_url SATUSEHAT sandbox, dan pastikan credential sandbox sudah aktif di sisi SATUSEHAT. Jika tenant sandbox Anda menerapkan allowlist jaringan, pastikan IP egress VPS juga sudah diizinkan."
				} else {
					hint = " Periksa pasangan mode production dengan credential production yang sesuai, auth_url SATUSEHAT production, dan pastikan IP egress VPS production sudah di-whitelist oleh SATUSEHAT."
				}
			}
		}

		headerSummary := fmt.Sprintf("server=%s, content-type=%s, route=%s, auth=%s", firstNonEmptyText(tokenResult.Server, "-"), firstNonEmptyText(tokenResult.ContentType, "-"), firstNonEmptyText(tokenResult.ProxyRoute, "direct"), authMethod)
		headerSummary += fmt.Sprintf(", client_id_len=%d, client_secret_len=%d", len(config.ClientID), len(config.ClientSecret))
		if tokenResult.CFRay != "" {
			headerSummary += fmt.Sprintf(", cf-ray=%s", tokenResult.CFRay)
		}
		if tokenResult.ProxyRoute != "" && tokenResult.ProxyRoute != "direct" {
			hint += " Terdeteksi HTTP(S)_PROXY aktif; pastikan proxy mengizinkan domain SATUSEHAT atau nonaktifkan proxy untuk koneksi SATUSEHAT."
		}

		errorMessage := fmt.Sprintf("gagal mengambil token SATUSEHAT (mode=%s, host=%s, status=%d, %s): %s%s", strings.TrimSpace(config.ActiveMode), authHost, tokenResult.StatusCode, headerSummary, message, hint)
		RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpointUsed, StatusCode: tokenResult.StatusCode, Success: false, ErrorMessage: errorMessage, RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials", "auth_method": authMethod}, ResponseBody: string(tokenResult.Body)})
		return TokenResponse{}, fmt.Errorf("%s", errorMessage)
	}

	tokenResponse, err := parseTokenResponse(tokenResult.Body)
	if err != nil {
		wrappedErr := fmt.Errorf("response token SATUSEHAT tidak valid: %w; body=%s", err, strings.TrimSpace(string(tokenResult.Body)))
		RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpointUsed, StatusCode: tokenResult.StatusCode, Success: false, ErrorMessage: wrappedErr.Error(), RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials", "auth_method": authMethod}, ResponseBody: string(tokenResult.Body)})
		return TokenResponse{}, wrappedErr
	}

	if strings.TrimSpace(tokenResponse.AccessToken) == "" {
		err := fmt.Errorf("token SATUSEHAT kosong")
		RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpointUsed, StatusCode: tokenResult.StatusCode, Success: false, ErrorMessage: err.Error(), RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials", "auth_method": authMethod}, ResponseBody: string(tokenResult.Body)})
		return TokenResponse{}, err
	}

	RecordActivityLog(ActivityLogEntry{Operation: "token", ResourceType: "OAuthToken", Mode: config.ActiveMode, Method: http.MethodPost, Endpoint: endpointUsed, StatusCode: tokenResult.StatusCode, Success: true, RequestPayload: map[string]any{"client_id": redactCredential(config.ClientID), "grant_type": "client_credentials", "auth_method": authMethod}, ResponseBody: map[string]any{"token_type": tokenResponse.TokenType, "expires_in": tokenResponse.ExpiresIn, "scope": tokenResponse.Scope}})

	return tokenResponse, nil
}

type tokenRequestResult struct {
	StatusCode  int
	Body        []byte
	ContentType string
	Server      string
	CFRay       string
	ProxyRoute  string
	Err         error
}

type tokenAuthMode string

const (
	tokenAuthForm         tokenAuthMode = "form"
	tokenAuthBasic        tokenAuthMode = "basic"
	tokenAuthBasicAndForm tokenAuthMode = "basic+form"
)

func sendTokenRequest(ctx context.Context, endpoint, clientID, clientSecret string, authMode tokenAuthMode) tokenRequestResult {
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	if authMode == tokenAuthForm || authMode == tokenAuthBasicAndForm {
		form.Set("client_id", clientID)
		form.Set("client_secret", clientSecret)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return tokenRequestResult{Err: err}
	}

	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Cache-Control", "no-cache")
	request.Header.Set("User-Agent", "SIMKLINIK/1.0")
	if authMode == tokenAuthBasic || authMode == tokenAuthBasicAndForm {
		encoded := base64.StdEncoding.EncodeToString([]byte(clientID + ":" + clientSecret))
		request.Header.Set("Authorization", "Basic "+encoded)
	}

	proxyRoute := "direct"
	if resolvedProxyURL, proxyErr := http.ProxyFromEnvironment(request); proxyErr == nil && resolvedProxyURL != nil {
		proxyRoute = resolvedProxyURL.String()
	}

	client := &http.Client{Timeout: 30 * time.Second}
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		return tokenRequestResult{Err: err, ProxyRoute: proxyRoute}
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 8192))
	if err != nil {
		return tokenRequestResult{
			StatusCode:  response.StatusCode,
			ContentType: strings.TrimSpace(response.Header.Get("Content-Type")),
			Server:      strings.TrimSpace(response.Header.Get("Server")),
			CFRay:       strings.TrimSpace(response.Header.Get("CF-RAY")),
			ProxyRoute:  proxyRoute,
			Err:         err,
		}
	}

	return tokenRequestResult{
		StatusCode:  response.StatusCode,
		Body:        body,
		ContentType: strings.TrimSpace(response.Header.Get("Content-Type")),
		Server:      strings.TrimSpace(response.Header.Get("Server")),
		CFRay:       strings.TrimSpace(response.Header.Get("CF-RAY")),
		ProxyRoute:  proxyRoute,
	}
}

func UpsertResource(ctx context.Context, config Config, resourceType string, resource map[string]any, existingResourceID string) (ResourceOperationResult, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	if err := config.EnsureEnabled(); err != nil {
		return ResourceOperationResult{}, err
	}

	trimmedResourceID := strings.TrimSpace(existingResourceID)
	if trimmedResourceID != "" && shouldSkipExistingResourceUpsert(ctx) {
		return ResourceOperationResult{
			Method:       "SKIP",
			StatusCode:   http.StatusOK,
			ResourceType: resourceType,
			ResourceID:   trimmedResourceID,
		}, nil
	}

	tokenResponse, err := RequestAccessToken(ctx, config)
	if err != nil {
		return ResourceOperationResult{}, err
	}

	payload := cloneMap(resource)
	method := http.MethodPost
	endpoint := strings.TrimRight(config.FHIRURL, "/") + "/" + strings.Trim(resourceType, "/")
	if trimmedResourceID != "" {
		method = http.MethodPut
		endpoint = strings.TrimRight(endpoint, "/") + "/" + trimmedResourceID
		payload["id"] = trimmedResourceID
	} else {
		// POST create must not send arbitrary local id; SATUSEHAT/FHIR validates id format strictly.
		delete(payload, "id")
	}

	identifierSystem, identifierValue := extractFirstIdentifier(payload)
	if method == http.MethodPost && identifierSystem != "" && identifierValue != "" {
		resolvedID, searchEndpoint, lookupErr := findExistingResourceIDByIdentifier(ctx, config, tokenResponse.AccessToken, resourceType, identifierSystem, identifierValue)
		if lookupErr == nil && resolvedID != "" {
			result := ResourceOperationResult{
				Method:       "SEARCH",
				StatusCode:   http.StatusOK,
				ResourceType: resourceType,
				ResourceID:   resolvedID,
				ResponseBody: map[string]any{
					"status": "found-by-identifier",
				},
			}

			RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: searchEndpoint, StatusCode: http.StatusOK, Success: true, RequestPayload: map[string]any{"identifier": identifierSystem + "|" + identifierValue}, ResponseBody: result.ResponseBody, ResourceID: resolvedID})
			return result, nil
		}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, Success: false, ErrorMessage: fmt.Sprintf("gagal menyusun payload %s: %v", resourceType, err), RequestPayload: payload})
		return ResourceOperationResult{}, fmt.Errorf("gagal menyusun payload %s: %w", resourceType, err)
	}

	operationKey := buildSyncOperationKey(method, endpoint, payload)
	if !acquireSyncOperationLock(operationKey) {
		err := fmt.Errorf("permintaan sinkronisasi %s duplikat masih diproses", resourceType)
		RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, Success: false, ErrorMessage: err.Error(), RequestPayload: payload})
		return ResourceOperationResult{}, err
	}
	defer releaseSyncOperationLock(operationKey)

	request, err := http.NewRequestWithContext(ctx, method, endpoint, strings.NewReader(string(body)))
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, Success: false, ErrorMessage: err.Error(), RequestPayload: payload})
		return ResourceOperationResult{}, err
	}
	request.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Idempotency-Key", operationKey)

	client := &http.Client{Timeout: 45 * time.Second}
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, Success: false, ErrorMessage: err.Error(), RequestPayload: payload})
		return ResourceOperationResult{}, err
	}
	defer response.Body.Close()

	responseBodyBytes, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return ResourceOperationResult{}, err
	}

	responseBody := map[string]any{}
	if trimmed := strings.TrimSpace(string(responseBodyBytes)); trimmed != "" {
		if err := json.Unmarshal(responseBodyBytes, &responseBody); err != nil {
			RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("response %s tidak valid JSON: %v", resourceType, err), RequestPayload: payload, ResponseBody: string(responseBodyBytes)})
			return ResourceOperationResult{}, fmt.Errorf("response %s tidak valid JSON: %w", resourceType, err)
		}
	}

	if response.StatusCode >= http.StatusBadRequest {
		message := extractOperationOutcomeMessage(responseBody)
		if message == "" {
			message = strings.TrimSpace(string(responseBodyBytes))
		}
		if message == "" {
			message = response.Status
		}

		if method == http.MethodPost && looksLikeDuplicateError(message) {
			if duplicateResourceID := extractDuplicateResourceIDFromMessage(message); duplicateResourceID != "" {
				result := ResourceOperationResult{
					Method:       "DUPLICATE-ID",
					StatusCode:   http.StatusOK,
					ResourceType: resourceType,
					ResourceID:   duplicateResourceID,
					ResponseBody: map[string]any{
						"status":       "resolved-duplicate-by-message",
						"source_error": message,
					},
				}

				RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: http.StatusOK, Success: true, RequestPayload: payload, ResponseBody: result.ResponseBody, ResourceID: duplicateResourceID})
				return result, nil
			}
		}

		if method == http.MethodPost && isInvalidIdentifierSystemError(message) && shouldRetryWithoutIdentifier(resourceType, payload) {
			retryPayload := cloneMap(payload)
			delete(retryPayload, "identifier")

			retryBody, marshalErr := json.Marshal(retryPayload)
			if marshalErr == nil {
				retryOperationKey := buildSyncOperationKey(method, endpoint, retryPayload)
				if acquireSyncOperationLock(retryOperationKey) {
					defer releaseSyncOperationLock(retryOperationKey)

					retryRequest, reqErr := http.NewRequestWithContext(ctx, method, endpoint, strings.NewReader(string(retryBody)))
					if reqErr == nil {
						retryRequest.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
						retryRequest.Header.Set("Accept", "application/json")
						retryRequest.Header.Set("Content-Type", "application/json")
						retryRequest.Header.Set("X-Idempotency-Key", retryOperationKey)

						throttleSATUSEHATCall()
						retryResponse, doErr := client.Do(retryRequest)
						if doErr == nil {
							defer retryResponse.Body.Close()
							retryResponseBodyBytes, readErr := io.ReadAll(io.LimitReader(retryResponse.Body, 2*1024*1024))
							if readErr == nil {
								retryResponseBody := map[string]any{}
								if trimmed := strings.TrimSpace(string(retryResponseBodyBytes)); trimmed != "" {
									if unmarshalErr := json.Unmarshal(retryResponseBodyBytes, &retryResponseBody); unmarshalErr != nil {
										retryResponseBody = map[string]any{"raw": string(retryResponseBodyBytes)}
									}
								}

								if retryResponse.StatusCode < http.StatusBadRequest {
									retryResourceID := strings.TrimSpace(asString(retryResponseBody["id"]))
									retryLocation := strings.TrimSpace(retryResponse.Header.Get("Location"))
									if retryResourceID == "" && retryLocation != "" {
										retryResourceID = extractResourceIDFromLocation(retryLocation)
									}

									result := ResourceOperationResult{
										Method:       "POST-WITHOUT-IDENTIFIER",
										StatusCode:   retryResponse.StatusCode,
										ResourceType: resourceType,
										ResourceID:   retryResourceID,
										Location:     retryLocation,
										ResponseBody: retryResponseBody,
									}

									RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: retryResponse.StatusCode, Success: true, RequestPayload: retryPayload, ResponseBody: retryResponseBody, ResourceID: retryResourceID, Location: retryLocation})
									return result, nil
								}
							}
						}
					}
				}
			}
		}

		if method == http.MethodPost && identifierSystem != "" && identifierValue != "" && looksLikeDuplicateError(message) {
			resolvedID, searchEndpoint, lookupErr := findExistingResourceIDByIdentifier(ctx, config, tokenResponse.AccessToken, resourceType, identifierSystem, identifierValue)
			if lookupErr == nil && resolvedID != "" {
				result := ResourceOperationResult{
					Method:       "SEARCH-DUPLICATE",
					StatusCode:   http.StatusOK,
					ResourceType: resourceType,
					ResourceID:   resolvedID,
					ResponseBody: map[string]any{
						"status":       "resolved-duplicate-by-identifier",
						"source_error": message,
					},
				}

				RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: searchEndpoint, StatusCode: http.StatusOK, Success: true, RequestPayload: map[string]any{"identifier": identifierSystem + "|" + identifierValue}, ResponseBody: result.ResponseBody, ResourceID: resolvedID})
				return result, nil
			}
		}

		RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: fmt.Sprintf("gagal submit %s ke SATUSEHAT: %s", resourceType, message), RequestPayload: payload, ResponseBody: responseBody})
		return ResourceOperationResult{}, fmt.Errorf("gagal submit %s ke SATUSEHAT: %s", resourceType, message)
	}

	resourceID := strings.TrimSpace(asString(responseBody["id"]))
	location := strings.TrimSpace(response.Header.Get("Location"))
	if resourceID == "" && location != "" {
		resourceID = extractResourceIDFromLocation(location)
	}
	if resourceID == "" {
		resourceID = trimmedResourceID
	}

	result := ResourceOperationResult{
		Method:       method,
		StatusCode:   response.StatusCode,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Location:     location,
		ResponseBody: responseBody,
	}

	RecordActivityLog(ActivityLogEntry{Operation: "sync", ResourceType: resourceType, Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: response.StatusCode, Success: true, RequestPayload: payload, ResponseBody: responseBody, ResourceID: resourceID, Location: location})

	return result, nil
}

func parseTokenResponse(body []byte) (TokenResponse, error) {
	var raw struct {
		AccessToken string          `json:"access_token"`
		TokenType   string          `json:"token_type"`
		ExpiresIn   json.RawMessage `json:"expires_in"`
		Scope       string          `json:"scope"`
	}

	if err := json.Unmarshal(body, &raw); err != nil {
		return TokenResponse{}, err
	}

	expiresIn, err := parseFlexibleInt(raw.ExpiresIn)
	if err != nil {
		return TokenResponse{}, fmt.Errorf("expires_in tidak valid: %w", err)
	}

	return TokenResponse{AccessToken: raw.AccessToken, TokenType: raw.TokenType, ExpiresIn: expiresIn, Scope: raw.Scope}, nil
}

func parseFlexibleInt(raw json.RawMessage) (int, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return 0, nil
	}

	var intValue int
	if err := json.Unmarshal(raw, &intValue); err == nil {
		return intValue, nil
	}

	var stringValue string
	if err := json.Unmarshal(raw, &stringValue); err == nil {
		parsed, parseErr := strconv.Atoi(strings.TrimSpace(stringValue))
		if parseErr != nil {
			return 0, parseErr
		}
		return parsed, nil
	}

	return 0, fmt.Errorf("nilai %s bukan integer", trimmed)
}

func redactCredential(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 6 {
		return "***"
	}
	return trimmed[:3] + "***" + trimmed[len(trimmed)-3:]
}

func cloneMap(source map[string]any) map[string]any {
	clone := make(map[string]any, len(source))
	for key, value := range source {
		clone[key] = value
	}
	return clone
}

func buildSyncOperationKey(method, endpoint string, payload map[string]any) string {
	serializedPayload, _ := json.Marshal(payload)
	source := strings.ToUpper(strings.TrimSpace(method)) + "|" + strings.TrimSpace(endpoint) + "|" + string(serializedPayload)
	hash := sha256.Sum256([]byte(source))
	return hex.EncodeToString(hash[:])
}

func acquireSyncOperationLock(key string) bool {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return true
	}
	_, loaded := satusehatInFlightSyncLocks.LoadOrStore(trimmed, time.Now())
	return !loaded
}

func releaseSyncOperationLock(key string) {
	trimmed := strings.TrimSpace(key)
	if trimmed == "" {
		return
	}
	satusehatInFlightSyncLocks.Delete(trimmed)
}

func asString(value any) string {
	stringValue, _ := value.(string)
	return stringValue
}

func extractResourceIDFromLocation(location string) string {
	trimmedLocation := strings.TrimSpace(location)
	if trimmedLocation == "" {
		return ""
	}

	parsedURL, err := url.Parse(trimmedLocation)
	if err != nil {
		segments := strings.Split(strings.Trim(trimmedLocation, "/"), "/")
		if len(segments) >= 2 {
			return segments[len(segments)-1]
		}
		return ""
	}

	trimmedPath := strings.Trim(parsedURL.Path, "/")
	segments := strings.Split(trimmedPath, "/")
	if len(segments) == 0 {
		return ""
	}
	if len(segments) >= 3 && segments[len(segments)-2] == "_history" {
		return segments[len(segments)-3]
	}
	return path.Base(trimmedPath)
}

func extractOperationOutcomeMessage(responseBody map[string]any) string {
	if len(responseBody) == 0 {
		return ""
	}

	if details, ok := responseBody["issue"].([]any); ok {
		messages := make([]string, 0, len(details))
		for _, detail := range details {
			issueMap, ok := detail.(map[string]any)
			if !ok {
				continue
			}
			if diagnostics := strings.TrimSpace(asString(issueMap["diagnostics"])); diagnostics != "" {
				messages = append(messages, diagnostics)
				continue
			}
			if detailsMap, ok := issueMap["details"].(map[string]any); ok {
				if text := strings.TrimSpace(asString(detailsMap["text"])); text != "" {
					messages = append(messages, text)
				}
			}
		}
		return strings.Join(messages, "; ")
	}

	return strings.TrimSpace(asString(responseBody["message"]))
}

func extractDuplicateResourceIDFromMessage(message string) string {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return ""
	}

	matched := satusehatResourceUUIDExtractPattern.FindString(trimmed)
	if matched == "" {
		return ""
	}

	return NormalizeFHIRResourceUUID(matched)
}

func NormalizeFHIRResourceUUID(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	trimmed = strings.Trim(trimmed, "/")
	if strings.Contains(trimmed, "/") {
		parts := strings.Split(trimmed, "/")
		trimmed = strings.TrimSpace(parts[len(parts)-1])
	}

	if satusehatResourceUUIDPattern.MatchString(trimmed) {
		return strings.ToLower(trimmed)
	}

	matched := satusehatResourceUUIDExtractPattern.FindString(raw)
	if matched == "" {
		return ""
	}

	return strings.ToLower(strings.TrimSpace(matched))
}

func looksLikeDuplicateError(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" {
		return false
	}
	return strings.Contains(normalized, "duplicate") ||
		strings.Contains(normalized, "duplikat") ||
		strings.Contains(normalized, "already exists") ||
		strings.Contains(normalized, "sudah ada") ||
		strings.Contains(normalized, "telah terdaftar") ||
		strings.Contains(normalized, "konflik")
}

func isInvalidIdentifierSystemError(message string) bool {
	normalized := strings.ToLower(strings.TrimSpace(message))
	if normalized == "" {
		return false
	}
	return strings.Contains(normalized, "invalid identifier system")
}

func shouldRetryWithoutIdentifier(resourceType string, payload map[string]any) bool {
	if payload == nil {
		return false
	}
	if _, exists := payload["identifier"]; !exists {
		return false
	}

	switch strings.ToLower(strings.TrimSpace(resourceType)) {
	case "medicationrequest", "medicationdispense", "servicerequest":
		return false
	default:
		return true
	}
}

func findExistingResourceIDByIdentifier(ctx context.Context, config Config, accessToken, resourceType, identifierSystem, identifierValue string) (string, string, error) {
	trimmedType := strings.Trim(strings.TrimSpace(resourceType), "/")
	trimmedSystem := strings.TrimSpace(identifierSystem)
	trimmedValue := strings.TrimSpace(identifierValue)
	if trimmedType == "" || trimmedSystem == "" || trimmedValue == "" {
		return "", "", nil
	}

	baseEndpoint := strings.TrimRight(config.FHIRURL, "/") + "/" + trimmedType
	searchQuery := url.Values{}
	searchQuery.Set("identifier", trimmedSystem+"|"+trimmedValue)
	searchEndpoint := baseEndpoint + "?" + searchQuery.Encode()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, searchEndpoint, nil)
	if err != nil {
		return "", searchEndpoint, err
	}
	request.Header.Set("Authorization", "Bearer "+accessToken)
	request.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	throttleSATUSEHATCall()
	response, err := client.Do(request)
	if err != nil {
		return "", searchEndpoint, err
	}
	defer response.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return "", searchEndpoint, err
	}

	responseBody := map[string]any{}
	if trimmed := strings.TrimSpace(string(bodyBytes)); trimmed != "" {
		if err := json.Unmarshal(bodyBytes, &responseBody); err != nil {
			return "", searchEndpoint, err
		}
	}

	if response.StatusCode >= http.StatusBadRequest {
		message := extractOperationOutcomeMessage(responseBody)
		if message == "" {
			message = strings.TrimSpace(string(bodyBytes))
		}
		if message == "" {
			message = response.Status
		}
		return "", searchEndpoint, fmt.Errorf("lookup identifier %s gagal: %s", trimmedType, message)
	}

	resourceID := extractResourceIDFromSearchBundle(responseBody)
	return resourceID, searchEndpoint, nil
}

func extractResourceIDFromSearchBundle(responseBody map[string]any) string {
	entries, ok := responseBody["entry"].([]any)
	if !ok {
		return ""
	}

	for _, entryRaw := range entries {
		entry, ok := entryRaw.(map[string]any)
		if !ok {
			continue
		}
		resource, ok := entry["resource"].(map[string]any)
		if !ok {
			continue
		}
		if normalizedID := NormalizeFHIRResourceUUID(asString(resource["id"])); normalizedID != "" {
			return normalizedID
		}
		if plainID := strings.TrimSpace(asString(resource["id"])); plainID != "" {
			return plainID
		}
	}

	return ""
}
