package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv                      string
	DatabaseDSN                 string
	DatabaseHost                string
	DatabasePort                string
	DatabaseUser                string
	DatabasePassword            string
	DatabaseName                string
	DatabaseSSLMode             string
	DatabaseTimeZone            string
	JWTSecret                   string
	ServerPort                  string
	CORSAllowedOrigins          []string
	BackupStoragePath           string
	UploadsPath                 string
	DefaultBackupCron           string
	DefaultBackupRetentionDays  int
	DefaultBackupIncludeUploads bool
}

func Load() *Config {
	databaseHost := getEnv("DATABASE_HOST", getEnv("POSTGRES_HOST", "localhost"))
	databasePort := getEnv("DATABASE_PORT", getEnv("POSTGRES_PORT", "5434"))
	databaseUser := getEnv("DATABASE_USER", getEnv("POSTGRES_USER", "simklinik"))
	databasePassword := getEnv("DATABASE_PASSWORD", getEnv("POSTGRES_PASSWORD", "simklinik123"))
	databaseName := getEnv("DATABASE_NAME", getEnv("POSTGRES_DB", "simklinik"))
	databaseSSLMode := getEnv("DATABASE_SSLMODE", "disable")
	databaseTimeZone := getEnv("DATABASE_TIMEZONE", "Asia/Jakarta")
	databaseDSN := strings.TrimSpace(getEnv("DATABASE_DSN", ""))
	if databaseDSN == "" {
		databaseDSN = buildPostgresDSN(databaseHost, databasePort, databaseUser, databasePassword, databaseName, databaseSSLMode, databaseTimeZone)
	}

	return &Config{
		AppEnv:                      getEnv("APP_ENV", "development"),
		DatabaseDSN:                 databaseDSN,
		DatabaseHost:                databaseHost,
		DatabasePort:                databasePort,
		DatabaseUser:                databaseUser,
		DatabasePassword:            databasePassword,
		DatabaseName:                databaseName,
		DatabaseSSLMode:             databaseSSLMode,
		DatabaseTimeZone:            databaseTimeZone,
		JWTSecret:                   getEnv("JWT_SECRET", "change-me-in-production"),
		ServerPort:                  getEnv("SERVER_PORT", "8080"),
		CORSAllowedOrigins:          splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")),
		BackupStoragePath:           getEnv("BACKUP_STORAGE_PATH", "./backups"),
		UploadsPath:                 getEnv("UPLOADS_PATH", "./uploads"),
		DefaultBackupCron:           getEnv("BACKUP_DEFAULT_CRON", "0 2 * * *"),
		DefaultBackupRetentionDays:  getEnvInt("BACKUP_DEFAULT_RETENTION_DAYS", 7),
		DefaultBackupIncludeUploads: getEnvBool("BACKUP_DEFAULT_INCLUDE_UPLOADS", true),
	}
}

func buildPostgresDSN(host, port, user, password, name, sslMode, timeZone string) string {
	return strings.Join([]string{
		"host=" + host,
		"user=" + user,
		"password=" + password,
		"dbname=" + name,
		"port=" + port,
		"sslmode=" + sslMode,
		"TimeZone=" + timeZone,
	}, " ")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		origins = append(origins, trimmed)
	}
	return origins
}

func getEnvInt(key string, defaultValue int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return defaultValue
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return defaultValue
	}

	return parsed
}

func getEnvBool(key string, defaultValue bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return defaultValue
	}

	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultValue
	}
}
