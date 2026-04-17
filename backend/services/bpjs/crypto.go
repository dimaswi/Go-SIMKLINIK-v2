package bpjs

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"time"

	lzstring "github.com/daku10/go-lz-string"
)

// GenerateSignature creates X-timestamp and X-signature for BPJS API headers
func GenerateSignature(consID, secretKey string) (string, string) {
	// UTC timestamp since epoch
	timestamp := strconv.FormatInt(time.Now().UTC().Unix(), 10)

	// Data to hash
	data := consID + "&" + timestamp

	// HMAC-SHA256
	h := hmac.New(sha256.New, []byte(secretKey))
	h.Write([]byte(data))

	// Base64 encode
	signature := base64.StdEncoding.EncodeToString(h.Sum(nil))

	return timestamp, signature
}

// DecryptBPJS decrypts the AES-256-CBC and decompresses with LZString
func DecryptBPJS(encryptedBase64 string, consID string, secretKey string, timestamp string) (string, error) {
	if encryptedBase64 == "" {
		return "", fmt.Errorf("encrypted string is empty")
	}

	key := consID + secretKey + timestamp

	// SHA256 Hash of key
	hash := sha256.Sum256([]byte(key))
	// Convert hash to bytes (AES-256 needs 32 bytes)
	keyHash := hash[:]

	// IV is the first 16 bytes of the hash
	iv := keyHash[:16]

	// Decode Base64
	cipherText, err := base64.StdEncoding.DecodeString(encryptedBase64)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create cipher block
	block, err := aes.NewCipher(keyHash)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	if len(cipherText) < aes.BlockSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	if len(cipherText)%aes.BlockSize != 0 {
		return "", fmt.Errorf("ciphertext is not a multiple of the block size")
	}

	// Decrypt (CBC mode)
	mode := cipher.NewCBCDecrypter(block, iv)
	mode.CryptBlocks(cipherText, cipherText)

	// PKCS7 Unpad
	cipherText, err = pkcs7Unpad(cipherText, aes.BlockSize)
	if err != nil {
		return "", fmt.Errorf("failed to unpad decrypted text: %w", err)
	}

	// LZString Decompress (like decompressFromEncodedURIComponent in PHP)
	decompressed, err := lzstring.DecompressFromEncodedURIComponent(string(cipherText))
	if err != nil {
		return "", fmt.Errorf("failed to decompress lzstring: %w", err)
	}

	return decompressed, nil
}

func pkcs7Unpad(b []byte, blocksize int) ([]byte, error) {
	if len(b) == 0 {
		return nil, fmt.Errorf("invalid padding size")
	}
	if len(b)%blocksize != 0 {
		return nil, fmt.Errorf("invalid padding")
	}
	c := b[len(b)-1]
	n := int(c)
	if n == 0 || n > len(b) {
		return nil, fmt.Errorf("invalid padding value")
	}
	for i := 0; i < n; i++ {
		if b[len(b)-n+i] != c {
			return nil, fmt.Errorf("invalid padding bytes")
		}
	}
	return b[:len(b)-n], nil
}
