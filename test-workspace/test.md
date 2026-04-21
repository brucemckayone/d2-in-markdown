# D2 Extension Test

## Basic Connection

```d2
x -> y: hello world
```

## Container with Nested Shapes

```d2
server: {
  api: API Server
  db: Database

  api -> db: query
}

client -> server.api: request
```

## Sequence Diagram

```d2
shape: sequence_diagram

# =====================================================================
# Configuration Loading Sequence
# Focus: How ApplicationConfiguration is loaded, validated, and assembled
# =====================================================================

# === ACTORS ===
ServiceManager: {
  shape: class
  label: "ServiceManager"
}

ConfigHelper: {
  shape: class
  label: "ApplicationConfigurationHelper"
}

LocalJson: {
  shape: document
  label: "AppConfig.json"
}

LocalValidators: {
  shape: class
  label: "Local Config Validators\n(9 Helpers using CRTP Base)"
}

AwsSecrets: {
  shape: class
  label: "AwsSecretsAccess"
}

AwsCloud: {
  shape: cloud
  label: "AWS Secrets Manager"
}

SecretValidators: {
  shape: class
  label: "Secret Config Validators\n(SqlConnection|MqttConnection)"
}

AppConfig: {
  shape: class
  label: "ApplicationConfiguration"
}

# === 1. INITIATE CONFIGURATION ===
Phase1: "1. Initiate Configuration Loading" {
  style.font-size: 36
  
  ServiceManager -> ConfigHelper: "new(configPath)"
  ServiceManager -> ConfigHelper: "getConfiguration(m_appConfig)"
}

# === 2. LOCAL JSON PARSING ===
Phase2: "2. Parse Local JSON File" {
  style.font-size: 36
  
  ConfigHelper -> LocalJson: "open file"
  LocalJson -> ConfigHelper: "file stream"
  ConfigHelper -> ConfigHelper: "nlohmann::json::parse()"
}

# === 3. LOCAL CONFIG VALIDATION ===
Phase3: "3. Validate Local Configuration Sections" {
  style.font-size: 36
  
  ConfigHelper -> LocalValidators: "validateLocalJsonConfig()"
  LocalValidators -> LocalValidators: "1. AwsConfigHelper -> aws"
  LocalValidators -> LocalValidators: "2. RtesConfigHelper -> rtesConfig"
  LocalValidators -> LocalValidators: "3. HlfLoggingConfigHelper -> hlfLogging"
  LocalValidators -> LocalValidators: "4. AppLoggingConfigHelper -> appLogging"
  LocalValidators -> LocalValidators: "5. PeLibConfigHelper -> peLibConfig"
  LocalValidators -> LocalValidators: "6. SqlClientConfigHelper -> sqlClientConfig (partial)"
  LocalValidators -> LocalValidators: "7. MqttClientConfigHelper -> mqttClientConfig (partial)"
  LocalValidators -> LocalValidators: "8. GuideConfigHelper -> guide"
  LocalValidators -> LocalValidators: "9. SchedulerConfigHelper -> scheduler"
  LocalValidators -> AppConfig: "populate non-secret fields"
}

# === 4. AWS SECRETS RETRIEVAL ===
Phase4: "4. Retrieve Secure Credentials from AWS" {
  style.font-size: 36
  
  ConfigHelper -> AwsSecrets: "new(timeout, region, requestTimeout)"
  ConfigHelper -> AwsSecrets: "getSecret(brokerSecretId)"
  AwsSecrets -> AwsCloud: "GetSecretValue()"
  AwsCloud -> AwsSecrets: "JSON credentials"
}

# === 5. SECRET CONFIG VALIDATION ===
Phase5: "5. Validate Secret Configuration" {
  style.font-size: 36
  
  ConfigHelper -> SecretValidators: "validateAwsJsonConfig()"
  SecretValidators -> SecretValidators: "SqlConnectionConfigHelper -> host, port, dbName, user, password"
  SecretValidators -> SecretValidators: "MqttConnectionConfigHelper -> brokerUrl, user, password, alpn"
  SecretValidators -> AppConfig: "populate secret credentials"
}

# === 6. RETURN COMPLETE CONFIG ===

## Layout Engine Comparison

This diagram renders differently between dagre and elk.
Switch via `Ctrl+Shift+P` → `D2: Configure Renderer` → `Change Layout Engine`.

```d2
direction: right

api_gateway: API Gateway

backend: Backend Services {
  auth: Auth Service
  users: User Service
  products: Product Service
}

database: Databases {
  users_db: Users DB
  products_db: Products DB
}

cache: Cache Layer {
  redis: Redis
  memcached: Memcached
}

api_gateway -> backend.auth: authenticate
api_gateway -> backend.users: get users
api_gateway -> backend.products: list products

backend.auth -> cache.redis: cache tokens
backend.users -> database.users_db: query
backend.products -> database.products_db: query
backend.users -> cache.memcached: cache results

cache.redis -> database.users_db: invalidate
```
Phase6: "6. Configuration Complete" {
  style.font-size: 36
  
  ConfigHelper -> ServiceManager: "return true (fully populated)"
}

```

## SQL Table

```d2
users: {
  shape: sql_table
  id: int {constraint: primary_key}
  name: varchar
  email: varchar
}
```

## Import Test

```d2
@import "./diagrams/architecture.d2"
```

## Deliberate Error (should show red error box)

```d2
-> invalid syntax here {{{
```
