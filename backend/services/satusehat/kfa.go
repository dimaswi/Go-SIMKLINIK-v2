package satusehat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type KFAConcept struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	Group string `json:"group,omitempty"`
}

type KFAUOM struct {
	Name   string `json:"name"`
	CSCode string `json:"cs_code,omitempty"`
}

type KFAActiveIngredient struct {
	KFACode      string `json:"kfa_code"`
	ZatAktif     string `json:"zat_aktif"`
	StrengthText string `json:"kekuatan_zat_aktif"`
	Active       bool   `json:"active"`
	State        string `json:"state"`
	UpdatedAt    string `json:"updated_at"`
}

type KFAProductTemplate struct {
	KFACode string `json:"kfa_code"`
	Name    string `json:"name"`
	State   string `json:"state"`
	Active  bool   `json:"active"`
}

type KFAProductSearchItem struct {
	Name            string             `json:"name"`
	KFACode         string             `json:"kfa_code"`
	Active          bool               `json:"active"`
	State           string             `json:"state"`
	Manufacturer    string             `json:"manufacturer"`
	Generik         *bool              `json:"generik"`
	UpdatedAt       string             `json:"updated_at"`
	FarmalkesType   KFAConcept         `json:"farmalkes_type"`
	UOM             KFAUOM             `json:"uom"`
	DosageForm      KFAConcept         `json:"dosage_form"`
	ProductTemplate KFAProductTemplate `json:"product_template"`
}

type KFAProductSearchResponse struct {
	Total int                    `json:"total"`
	Page  int                    `json:"page"`
	Size  int                    `json:"size"`
	Data  []KFAProductSearchItem `json:"data"`
}

type KFAProductDetail struct {
	Name              string                `json:"name"`
	KFACode           string                `json:"kfa_code"`
	Active            bool                  `json:"active"`
	State             string                `json:"state"`
	Manufacturer      string                `json:"manufacturer"`
	Registrar         string                `json:"registrar"`
	Generik           bool                  `json:"generik"`
	UpdatedAt         string                `json:"updated_at"`
	DosePerUnit       float64               `json:"dose_per_unit"`
	FixPrice          float64               `json:"fix_price"`
	HetPrice          float64               `json:"het_price"`
	FarmalkesType     KFAConcept            `json:"farmalkes_type"`
	DosageForm        KFAConcept            `json:"dosage_form"`
	Route             KFAConcept            `json:"rute_pemberian"`
	UOM               KFAUOM                `json:"uom"`
	ProductTemplate   KFAProductTemplate    `json:"product_template"`
	ActiveIngredients []KFAActiveIngredient `json:"active_ingredients"`
}

func SearchKFAProducts(ctx context.Context, config Config, keyword string, page, size int) (KFAProductSearchResponse, error) {
	trimmedKeyword := strings.TrimSpace(keyword)
	if trimmedKeyword == "" {
		return KFAProductSearchResponse{}, fmt.Errorf("keyword KFA wajib diisi")
	}
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 50 {
		size = 10
	}

	query := url.Values{}
	query.Set("page", fmt.Sprintf("%d", page))
	query.Set("size", fmt.Sprintf("%d", size))
	query.Set("product_type", "farmasi")
	query.Set("keyword", trimmedKeyword)

	body, endpoint, err := doKFARequest(ctx, config, http.MethodGet, "/products/all", query)
	if err != nil {
		return KFAProductSearchResponse{}, err
	}

	var response struct {
		Total int `json:"total"`
		Page  int `json:"page"`
		Size  int `json:"size"`
		Items struct {
			Data []KFAProductSearchItem `json:"data"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return KFAProductSearchResponse{}, fmt.Errorf("response pencarian KFA tidak valid: %w", err)
	}

	RecordActivityLog(ActivityLogEntry{Operation: "kfa-search", ResourceType: "KFAProduct", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: true, ResponseBody: map[string]any{"total": response.Total, "page": response.Page, "size": response.Size}})

	return KFAProductSearchResponse{Total: response.Total, Page: response.Page, Size: response.Size, Data: response.Items.Data}, nil
}

func GetKFAProductDetail(ctx context.Context, config Config, code string) (*KFAProductDetail, error) {
	trimmedCode := strings.TrimSpace(code)
	if !looksLikeKFACode(trimmedCode) {
		return nil, fmt.Errorf("kode KFA tidak valid")
	}

	query := url.Values{}
	query.Set("identifier", "kfa")
	query.Set("code", trimmedCode)

	body, endpoint, err := doKFARequest(ctx, config, http.MethodGet, "/products", query)
	if err != nil {
		return nil, err
	}

	var response struct {
		SearchCode string           `json:"search_code"`
		Result     KFAProductDetail `json:"result"`
	}
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("response detail KFA tidak valid: %w", err)
	}
	if strings.TrimSpace(response.Result.KFACode) == "" {
		return nil, fmt.Errorf("produk KFA %s tidak ditemukan", trimmedCode)
	}

	RecordActivityLog(ActivityLogEntry{Operation: "kfa-detail", ResourceType: "KFAProduct", Mode: config.ActiveMode, Method: http.MethodGet, Endpoint: endpoint, Success: true, ResourceID: strings.TrimSpace(response.Result.KFACode), ResponseBody: map[string]any{"kfa_code": response.Result.KFACode, "name": response.Result.Name}})

	return &response.Result, nil
}

func doKFARequest(ctx context.Context, config Config, method, resourcePath string, query url.Values) ([]byte, string, error) {
	if missing := config.MissingRequiredFields(true); len(missing) > 0 {
		return nil, "", fmt.Errorf("konfigurasi SATUSEHAT belum lengkap: %s", strings.Join(missing, ", "))
	}

	tokenResponse, err := RequestAccessToken(ctx, config)
	if err != nil {
		return nil, "", err
	}

	baseURL := strings.TrimRight(config.KFAURL, "/")
	endpoint := baseURL + resourcePath
	if encoded := query.Encode(); encoded != "" {
		endpoint += "?" + encoded
	}

	request, err := http.NewRequestWithContext(ctx, method, endpoint, nil)
	if err != nil {
		return nil, endpoint, err
	}
	request.Header.Set("Authorization", "Bearer "+tokenResponse.AccessToken)
	request.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		RecordActivityLog(ActivityLogEntry{Operation: "kfa-request", ResourceType: "KFAProduct", Mode: config.ActiveMode, Method: method, Endpoint: endpoint, Success: false, ErrorMessage: err.Error()})
		return nil, endpoint, err
	}
	defer response.Body.Close()

	body, err := io.ReadAll(io.LimitReader(response.Body, 2*1024*1024))
	if err != nil {
		return nil, endpoint, err
	}

	if response.StatusCode >= http.StatusBadRequest {
		message := extractKFAErrorMessage(body)
		if message == "" {
			message = strings.TrimSpace(string(body))
		}
		if message == "" {
			message = response.Status
		}
		RecordActivityLog(ActivityLogEntry{Operation: "kfa-request", ResourceType: "KFAProduct", Mode: config.ActiveMode, Method: method, Endpoint: endpoint, StatusCode: response.StatusCode, Success: false, ErrorMessage: message, ResponseBody: string(body)})
		return nil, endpoint, fmt.Errorf("gagal mengambil data KFA: %s", message)
	}

	return body, endpoint, nil
}

func extractKFAErrorMessage(body []byte) string {
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return ""
	}

	var response map[string]any
	if err := json.Unmarshal(body, &response); err != nil {
		return trimmed
	}

	if detailList, ok := response["detail"].([]any); ok {
		messages := make([]string, 0, len(detailList))
		for _, item := range detailList {
			detailMap, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if message := strings.TrimSpace(asString(detailMap["msg"])); message != "" {
				messages = append(messages, message)
			}
		}
		if len(messages) > 0 {
			return strings.Join(messages, "; ")
		}
	}

	if message := strings.TrimSpace(asString(response["message"])); message != "" {
		return message
	}

	return extractOperationOutcomeMessage(response)
}
