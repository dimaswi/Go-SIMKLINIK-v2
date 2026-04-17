package bpjs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	Config     Config
	HTTPClient *http.Client
}

type ReferencePoli struct {
	Code                  string `json:"kodepoli"`
	Name                  string `json:"namapoli"`
	SubSpecializationCode string `json:"kdsubspesialis,omitempty"`
	SubSpecializationName string `json:"nmsubspesialis,omitempty"`
}

type ReferenceDoctor struct {
	Code     string `json:"kodedokter"`
	Name     string `json:"namadokter"`
	Schedule string `json:"jampraktek,omitempty"`
	Capacity int    `json:"kapasitas,omitempty"`
}

type bpjsReferenceListResponse[T any] struct {
	List []T `json:"list"`
}

func NewClient() (*Client, error) {
	cfg, err := LoadAntreanConfig()
	if err != nil {
		return nil, err
	}

	if err := cfg.EnsureEnabled(); err != nil {
		return nil, err
	}

	return &Client{
		Config: cfg,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}, nil
}

func (c *Client) doRequest(method, endpoint string, body interface{}) ([]byte, int, error) {
	responseBody, statusCode, _, err := c.doRequestDetailed(method, endpoint, body)
	return responseBody, statusCode, err
}

func (c *Client) doRequestDetailed(method, endpoint string, body interface{}) ([]byte, int, string, error) {
	url := fmt.Sprintf("%s%s", c.Config.BaseURL, endpoint)

	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return nil, 0, "", fmt.Errorf("failed to marshal body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		return nil, 0, "", fmt.Errorf("failed to create request: %w", err)
	}

	timestamp, signature := GenerateSignature(c.Config.ConsID, c.Config.SecretKey)

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-cons-id", c.Config.ConsID)
	req.Header.Set("x-timestamp", timestamp)
	req.Header.Set("x-signature", signature)
	req.Header.Set("user_key", c.Config.UserKey)

	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, timestamp, fmt.Errorf("failed to execute request: %w", err)
	}
	defer res.Body.Close()

	resBody, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, res.StatusCode, timestamp, fmt.Errorf("failed to read response: %w", err)
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return resBody, res.StatusCode, timestamp, fmt.Errorf("API returned status %d: %s", res.StatusCode, string(resBody))
	}

	return resBody, res.StatusCode, timestamp, nil
}

type BPJSMetadata struct {
	Message string `json:"message"`
	Code    int    `json:"code"`
}

type BPJSBaseResponse struct {
	Metadata BPJSMetadata `json:"metadata"`
	Response interface{}  `json:"response"` // Could be an encrypted string or null
}

func (c *Client) decodeResponsePayload(raw []byte, timestamp string, target interface{}) (BPJSBaseResponse, error) {
	var baseResp BPJSBaseResponse
	if err := json.Unmarshal(raw, &baseResp); err != nil {
		return BPJSBaseResponse{}, fmt.Errorf("failed to parse response: %w", err)
	}

	if target == nil || baseResp.Response == nil {
		return baseResp, nil
	}

	switch payload := baseResp.Response.(type) {
	case string:
		decrypted, err := DecryptBPJS(payload, c.Config.ConsID, c.Config.SecretKey, timestamp)
		if err != nil {
			return baseResp, fmt.Errorf("failed to decrypt response: %w", err)
		}
		if err := json.Unmarshal([]byte(decrypted), target); err != nil {
			return baseResp, fmt.Errorf("failed to parse decrypted response: %w", err)
		}
	default:
		responseBytes, err := json.Marshal(payload)
		if err != nil {
			return baseResp, fmt.Errorf("failed to marshal response payload: %w", err)
		}
		if err := json.Unmarshal(responseBytes, target); err != nil {
			return baseResp, fmt.Errorf("failed to parse response payload: %w", err)
		}
	}

	return baseResp, nil
}

func (c *Client) GetReferencePoli(tanggal string) ([]ReferencePoli, error) {
	endpoint := "/ref/poli/tanggal/" + url.PathEscape(strings.TrimSpace(tanggal))
	resBytes, statusCode, timestamp, err := c.doRequestDetailed(http.MethodGet, endpoint, nil)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-poli",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: err.Error(),
			ResponseBody: string(resBytes),
		})
		return nil, err
	}

	var payload bpjsReferenceListResponse[ReferencePoli]
	baseResp, err := c.decodeResponsePayload(resBytes, timestamp, &payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-poli",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: err.Error(),
			ResponseBody: string(resBytes),
		})
		return nil, err
	}

	if baseResp.Metadata.Code != 200 && baseResp.Metadata.Code != 1 {
		wrappedErr := fmt.Errorf("API error: %s (code %d)", baseResp.Metadata.Message, baseResp.Metadata.Code)
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-poli",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: wrappedErr.Error(),
			ResponseBody: baseResp,
		})
		return nil, wrappedErr
	}

	RecordActivityLog(ActivityLogEntry{
		Domain:       c.Config.Domain,
		Direction:    DirectionOutbound,
		Operation:    "reference-poli",
		Method:       http.MethodGet,
		Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
		StatusCode:   statusCode,
		Success:      true,
		ResponseBody: map[string]any{"count": len(payload.List)},
	})

	return payload.List, nil
}

func (c *Client) GetReferenceDoctor(tanggal string) ([]ReferenceDoctor, error) {
	endpoint := "/ref/dokter/tanggal/" + url.PathEscape(strings.TrimSpace(tanggal))
	resBytes, statusCode, timestamp, err := c.doRequestDetailed(http.MethodGet, endpoint, nil)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-dokter",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: err.Error(),
			ResponseBody: string(resBytes),
		})
		return nil, err
	}

	var payload bpjsReferenceListResponse[ReferenceDoctor]
	baseResp, err := c.decodeResponsePayload(resBytes, timestamp, &payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-dokter",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: err.Error(),
			ResponseBody: string(resBytes),
		})
		return nil, err
	}

	if baseResp.Metadata.Code != 200 && baseResp.Metadata.Code != 1 {
		wrappedErr := fmt.Errorf("API error: %s (code %d)", baseResp.Metadata.Message, baseResp.Metadata.Code)
		RecordActivityLog(ActivityLogEntry{
			Domain:       c.Config.Domain,
			Direction:    DirectionOutbound,
			Operation:    "reference-dokter",
			Method:       http.MethodGet,
			Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
			StatusCode:   statusCode,
			Success:      false,
			ErrorMessage: wrappedErr.Error(),
			ResponseBody: baseResp,
		})
		return nil, wrappedErr
	}

	RecordActivityLog(ActivityLogEntry{
		Domain:       c.Config.Domain,
		Direction:    DirectionOutbound,
		Operation:    "reference-dokter",
		Method:       http.MethodGet,
		Endpoint:     strings.TrimSpace(c.Config.BaseURL) + endpoint,
		StatusCode:   statusCode,
		Success:      true,
		ResponseBody: map[string]any{"count": len(payload.List)},
	})

	return payload.List, nil
}

func (c *Client) CallNextQueue(tanggalPeriksa, kodePoli, nomorKartu string) error {
	// Status 1 = Hadir
	payload := map[string]interface{}{
		"tanggalperiksa": tanggalPeriksa,
		"kodepoli":       kodePoli,
		"nomorkartu":     nomorKartu,
		"status":         1,
		"waktu":          time.Now().UnixNano() / int64(time.Millisecond),
	}

	resBytes, statusCode, err := c.doRequest("POST", "/antrean/panggil", payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "call-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/panggil",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   err.Error(),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return err
	}

	var baseResp BPJSBaseResponse
	if err := json.Unmarshal(resBytes, &baseResp); err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "call-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/panggil",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   fmt.Sprintf("failed to parse response: %v", err),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if baseResp.Metadata.Code != 200 && baseResp.Metadata.Code != 1 {
		wrappedErr := fmt.Errorf("API error: %s (code %d)", baseResp.Metadata.Message, baseResp.Metadata.Code)
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "call-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/panggil",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   wrappedErr.Error(),
			RequestPayload: payload,
			ResponseBody:   baseResp,
		})
		return wrappedErr
	}

	RecordActivityLog(ActivityLogEntry{
		Domain:         c.Config.Domain,
		Direction:      DirectionOutbound,
		Operation:      "call-antrean",
		Method:         http.MethodPost,
		Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/panggil",
		StatusCode:     statusCode,
		Success:        true,
		RequestPayload: payload,
		ResponseBody:   baseResp,
	})

	return nil
}

func (c *Client) CancelQueue(tanggalPeriksa, kodePoli, nomorKartu, alasan string) error {
	payload := map[string]interface{}{
		"tanggalperiksa": tanggalPeriksa,
		"kodepoli":       kodePoli,
		"nomorkartu":     nomorKartu,
		"alasan":         alasan,
	}

	resBytes, statusCode, err := c.doRequest("POST", "/antrean/batal", payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "cancel-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/batal",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   err.Error(),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return err
	}

	var baseResp BPJSBaseResponse
	if err := json.Unmarshal(resBytes, &baseResp); err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "cancel-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/batal",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   fmt.Sprintf("failed to parse response: %v", err),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if baseResp.Metadata.Code != 200 && baseResp.Metadata.Code != 1 {
		wrappedErr := fmt.Errorf("API error: %s (code %d)", baseResp.Metadata.Message, baseResp.Metadata.Code)
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "cancel-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/batal",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   wrappedErr.Error(),
			RequestPayload: payload,
			ResponseBody:   baseResp,
		})
		return wrappedErr
	}

	RecordActivityLog(ActivityLogEntry{
		Domain:         c.Config.Domain,
		Direction:      DirectionOutbound,
		Operation:      "cancel-antrean",
		Method:         http.MethodPost,
		Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean/batal",
		StatusCode:     statusCode,
		Success:        true,
		RequestPayload: payload,
		ResponseBody:   baseResp,
	})

	return nil
}

func (c *Client) AddAntrean(payload map[string]interface{}) error {
	resBytes, statusCode, err := c.doRequest("POST", "/antrean", payload)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "add-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   err.Error(),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return err
	}

	var baseResp BPJSBaseResponse
	if err := json.Unmarshal(resBytes, &baseResp); err != nil {
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "add-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   fmt.Sprintf("failed to parse response: %v", err),
			RequestPayload: payload,
			ResponseBody:   string(resBytes),
		})
		return fmt.Errorf("failed to parse response: %w", err)
	}

	if baseResp.Metadata.Code != 200 && baseResp.Metadata.Code != 1 && baseResp.Metadata.Code != 201 {
		wrappedErr := fmt.Errorf("API error: %s (code %d)", baseResp.Metadata.Message, baseResp.Metadata.Code)
		RecordActivityLog(ActivityLogEntry{
			Domain:         c.Config.Domain,
			Direction:      DirectionOutbound,
			Operation:      "add-antrean",
			Method:         http.MethodPost,
			Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean",
			StatusCode:     statusCode,
			Success:        false,
			ErrorMessage:   wrappedErr.Error(),
			RequestPayload: payload,
			ResponseBody:   baseResp,
		})
		return wrappedErr
	}

	RecordActivityLog(ActivityLogEntry{
		Domain:         c.Config.Domain,
		Direction:      DirectionOutbound,
		Operation:      "add-antrean",
		Method:         http.MethodPost,
		Endpoint:       strings.TrimSpace(c.Config.BaseURL) + "/antrean",
		StatusCode:     statusCode,
		Success:        true,
		RequestPayload: payload,
		ResponseBody:   baseResp,
	})

	return nil
}
