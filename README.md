# 🛒 CUBE: Scalable Microservice-Based E-Commerce Platform

CUBE is an enterprise-grade, highly-scalable, event-driven microservices e-commerce backend built with **NestJS**, **TypeScript**, and a robust distributed data infrastructure. The project is managed as a high-performance monorepo using **Turborepo** and **pnpm**. 

This platform implements segregated domain databases, distributed caching, full-text fuzzy search, multi-factor authentication (MFA), a real-time support engine, and async notification delivery.

[![NestJS](https://img.shields.io/badge/Framework-NestJS-E0234E?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![pnpm](https://img.shields.io/badge/Workspace-pnpm-F69220?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444?style=flat-square&logo=turborepo)](https://turbo.build/)
[![Docker](https://img.shields.io/badge/Infrastructure-Docker-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

---

## 🗺️ System Architecture

CUBE utilizes a decentralized database-per-service pattern to ensure strict service boundaries and database independence. Event-driven communication handles asynchronous synchronization (e.g., search indexing, email queues), while the API Gateway routes client traffic via synchronous reverse proxying.

```
                      ┌───────────────────────────────┐
                      │          API CLIENT           │
                      └───────────────┬───────────────┘
                                      │ HTTPS (Port 3000)
                                      ▼
                      ┌───────────────────────────────┐
                      │          API GATEWAY          │
                      └──────┬────────┬────────┬──────┘
                             │        │        │ (Reverse Proxy)
             ┌───────────────┘        │        └───────────────┐
             ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │  Auth Service   │      │  User Service   │      │ Product Service │
    │   (Port 3001)   │      │   (Port 3002)   │      │   (Port 3004)   │
    └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
             │                        │                        │
             ▼                        ▼                        ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │   PostgreSQL    │      │   PostgreSQL    │      │   PostgreSQL    │
    │  (auth_db)      │      │  (user_db)      │      │  (product_db)   │
    └─────────────────┘      └─────────────────┘      └─────────────────┘
             │                        │                        │
             │                        ▼                        │
             │             ┌─────────────────────┐             │
             │             │  Notification Svc   │             │
             │             │     (Port 3003)     │             │
             │             └─────────────────────┘             │
             │                        ▲                        │
             │                        │ RabbitMQ               │
             └─────────────────► [RabbitMQ] ◄──────────────────┘
                                  (Port 5672)
                                      │
                                      ▼
                           ┌─────────────────────┐
                           │   Search Service    │◄─── (Elasticsearch)
                           │     (Port 3005)     │
                           └─────────────────────┘
```

### Monorepo Registry & Port Mapping

| Service / Infrastructure Component | Port | Communication Protocol | Database / Cache | Status |
| :--- | :--- | :--- | :--- | :--- |
| **API Gateway** | `3000` | HTTP | None | 🟢 Implemented |
| **Auth Service** | `3001` | HTTP / gRPC | PostgreSQL (`auth_db`) + Redis | 🟢 Implemented |
| **User Service** | `3002` | HTTP | PostgreSQL (`user_db`) | 🟢 Implemented |
| **Notification Service** | `3003` | HTTP / RabbitMQ | None (SMTP / SMS APIs) | 🟢 Implemented |
| **Product Service** | `3004` | HTTP / RabbitMQ | PostgreSQL (`product_db`) + MinIO | 🟢 Implemented |
| **Search Service** | `3005` | HTTP / RabbitMQ | Elasticsearch | 🟢 Implemented |
| **Cart Service** | `3006` | HTTP / Redis | Redis + MongoDB (`cart_db`) | 🟡 Roadmap |
| **Order Service** | `3007` | HTTP / RabbitMQ | PostgreSQL (`order_db`) | 🟡 Roadmap |
| **Offer Service** | `3008` | HTTP | PostgreSQL / Redis | 🟡 Roadmap |
| **Payment Service** | `3009` | HTTP | PostgreSQL | 🟡 Roadmap |
| **Inventory Service** | `3010` | HTTP / RabbitMQ | PostgreSQL (`inventory_db`) | 🟡 Roadmap |
| **Shipping Service** | `3011` | HTTP / RabbitMQ | PostgreSQL (`shipping_db`) | 🟡 Roadmap |
| **Support Service** | `3012` | WebSockets / HTTP | PostgreSQL (`support_db`) + Redis | 🟡 Roadmap |
| **Analytics Service** | `3013` | Kafka / HTTP | ClickHouse | 🟡 Roadmap |
| **PostgreSQL** | `5432` | Database TCP | Relational Store (Multi-Tenant DBs) | 🟢 Dev Environment |
| **Redis Cache** | `6379` | Cache TCP | Key-Value Cache & Session Store | 🟢 Dev Environment |
| **RabbitMQ Broker** | `5672` / `15672` | AMQP / Web HTTP | Event Queue & Admin Console | 🟢 Dev Environment |
| **Apache Kafka** | `9092` | TCP | Real-Time Analytical Pipelines | 🟢 Dev Environment |
| **Elasticsearch** | `9200` | HTTP JSON | Catalog Search Engine | 🟢 Dev Environment |
| **MinIO (S3)** | `9000` / `9001` | HTTP S3 API / Console | Object Storage Server | 🟢 Dev Environment |
| **ClickHouse** | `8123` / `9009` | HTTP / Native TCP | OLAP Columnar Store | 🟢 Dev Environment |

---

## ✨ Features

### 1. Identity & Access Management (Auth & User Services)
*   **Secure Authentication & Session Controls**: Standard registration and login workflows. Passwords hashed using `bcrypt` (12 rounds). Session control powered by JWT Access/Refresh tokens with full Token Rotation (family-based reuse detection) and Redis-backed blacklisting on logout.
*   **Multi-Factor Authentication (MFA)**:
    *   *TOTP*: Time-based OTP setup (Google Authenticator) with secret credentials encrypted via `AES-256` (GCM) and hashed single-use backup codes.
    *   *SMS*: Verified SMS OTP setup using Twilio and BulkSMSBD.
    *   *Transitions*: JWT-signed transition state `tempToken` limits session generation until the 2nd factor is approved.
*   **Audit Logging**: Every login attempt (success, password_failed, mfa_failed) is logged with User Agent, IP Address, and timestamp, retained for 90 days.
*   **GDPR Compliance Tools**: Data export (asynchronous generation of a JSON bundle containing all profile, addresses, and wishlist history) and soft-deletion routines with a 30-day restoration grace period before hard-deletion.
*   **Address Management**: Built-in address book support with defaults configured for shipping and billing addresses.

### 2. Catalog & Search (Product & Search Services)
*   **Product CRUD & Categorization**: Products support immutable SKUs, custom JSON metadata, nested hierarchy categories (prevents circular parent dependency), and brand mappings.
*   **Media Pipeline**: Native MinIO integration. Uploaded assets undergo automatic image resizing via `sharp` to yield standard and thumbnail sizes (200x200, 400x400 WebP formats).
*   **Verified Reviews & Social Proof**: Authenticated reviews allowed only for users who have completed orders for that product. Review moderation (Pending/Approved/Rejected) and helpful-vote registries.
*   **Elasticsearch Indexing**: Real-time eventual consistency indexing of products via RabbitMQ broker. Includes fuzzy search, faceted filtering (categories, brands, prices, availability), sorting criteria, and type-ahead autocomplete suggestions.
*   **Resilient Fallback Search**: Seamlessly switches to native PostgreSQL `ILIKE` pattern if Elasticsearch is down, logging system warnings.

### 3. Asynchronous Communications (Notification Service)
*   **Multi-Channel Dispatcher**: Handles Email (SMTP primary), SMS (Twilio, BulkSMSBD), and WebSockets/In-App alerts.
*   **Robust Delivery**: Standardizes retry patterns, logs SMS costs against configurable budget caps, and automatically processes bounce-back events.

---

## 🛠️ Tech Stack

### Framework & Language
*   **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)
*   **Framework**: [NestJS v10](https://nestjs.com/) (Modular architecture, Express platform)
*   **ORM**: [Prisma ORM](https://www.prisma.io/) (PostgreSQL client generation)
*   **Validation**: [Zod](https://zod.dev/) (System runtime env configurations) & [class-validator](https://github.com/typestack/class-validator) (HTTP Request Payload mapping)

### Databases & Infrastructure
*   **PostgreSQL 16**: Relational storage separated into logical database schemas.
*   **Redis 7**: High-speed rate limiting, blacklisting, and MFA flow caches.
*   **RabbitMQ 3.13**: Asynchronous message queues (AMQP).
*   **Elasticsearch 8.13**: High-performance search catalog indexing.
*   **MinIO**: Private S3-compatible file storage.
*   **Apache Kafka & ClickHouse**: Streaming data pipelines and analytical storage.
*   **Nginx / Nest API Gateway**: Central reverse-proxy gateway routing traffic.

### DevOps & Observability
*   **Monorepo Engine**: [Turborepo](https://turbo.build/)
*   **Package Manager**: [pnpm Workspaces](https://pnpm.io/)
*   **Bundling**: [tsup](https://github.com/egoist/tsup) (Shared packages compiler)
*   **Structured Logging**: [Pino Logger](https://github.com/pinojs/pino)
*   **Monitoring**: Prometheus metrics, Loki log aggregations, and Jaeger tracing (OpenTelemetry).

---

## 📂 Project Structure

The project is structured as a monorepo workspace to ease sharing configurations and libraries between independent microservices:

```
cube-server/
├── apps/
│   ├── api-gateway/            # Routing proxy gateway directing HTTP queries to microservices (Port 3000)
│   ├── auth-service/           # Handles register, login, MFA configurations, & sessions (Port 3001)
│   ├── user-service/           # User profiles, addresses, wishlist, and data removal tools (Port 3002)
│   ├── notification-service/   # Email, SMS, & push notifications dispatcher (Port 3003)
│   ├── product-service/        # Catalog cataloging, brands, categories hierarchy, & reviews (Port 3004)
│   └── search-service/         # Elasticsearch-backed fuzzy query engine & sync indexes (Port 3005)
├── packages/
│   ├── common/                 # Shared decorators, NestJS guards, pipes, interceptors, and DTOs
│   ├── config/                 # Central Zod validation factories for environments configuration
│   ├── database/               # Shared database interfaces and module declarations
│   ├── logger/                 # Structured Pino JSON logger and Loki transports
│   ├── messaging/              # RabbitMQ client connection modules and Event publishers
│   └── storage/                # MinIO S3 wrapper & sharp image utility helpers
└── infra/
    └── docker/
        ├── docker-compose.dev.yml  # Local developer infrastructure (databases & services)
        └── init-dbs.sql            # DB SQL script creating isolated PostgreSQL schemas
```

---

## 🏁 Getting Started

Follow these steps to run the microservices monorepo locally.

### Prerequisites
Make sure you have the following installed on your host system:
*   [Node.js](https://nodejs.org/en) (v18.x or higher)
*   [pnpm](https://pnpm.io/) (v9.x or higher)
*   [Docker & Docker Compose](https://www.docker.com/)

---

### Installation & Initialization

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Shakilofficial/cube-server.git
   cd cube-server
   ```

2. **Install Workspace Dependencies**:
   ```bash
   pnpm install
   ```

3. **Start Development Infrastructure**:
   Spin up Postgres, Redis, RabbitMQ, Elasticsearch, MinIO, Kafka, and ClickHouse:
   ```bash
   docker-compose -f infra/docker/docker-compose.dev.yml up -d
   ```

4. **Prepare Environment Files**:
   Create `.env` files in each service directory (see [Environment Variables](#key-environment-variables) for configuration parameters):
   *   `apps/auth-service/.env` (Copy from `.env.example`)
   *   `apps/user-service/.env` (Create from table guidelines)
   *   `apps/product-service/.env` (Copy from `.env.example`)
   *   `apps/notification-service/.env` (Copy from `.env.example`)
   *   `apps/search-service/.env` (Copy from `.env.example`)

5. **Generate Database Clients & Apply Schemas**:
   Sync Prisma schemas with the PostgreSQL instances:
   ```bash
   # Generate Prisma client for all packages/services
   pnpm -r prisma:generate

   # Push schemas to PostgreSQL databases
   pnpm --filter auth-service prisma:push
   pnpm --filter user-service prisma:push
   pnpm --filter product-service prisma:push
   ```

6. **Start All Services In Development Mode**:
   Launch the API Gateway and microservices concurrently using Turborepo:
   ```bash
   pnpm dev
   ```
   Turborepo will coordinate service compilation and hot-reload. The API Gateway will be listening at **`http://localhost:3000`**.

---

## 🔑 Key Environment Variables

Each application under `/apps` requires configuration via environment variables:

### API Gateway (`apps/api-gateway`)
*No `.env` required. It uses config defaults unless overridden at runtime:*
| Name | Default Value | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | Gateway listening port |
| `ALLOWED_ORIGINS` | `*` | CORS configurations |
| `AUTH_SERVICE_URL` | `http://localhost:3001` | Auth microservice address |
| `USER_SERVICE_URL` | `http://localhost:3002` | User profile address |
| `NOTIFICATION_SERVICE_URL` | `http://localhost:3003` | Notification service address |
| `PRODUCT_SERVICE_URL` | `http://localhost:3004` | Catalog service address |
| `SEARCH_SERVICE_URL` | `http://localhost:3005` | Elasticsearch proxy address |

### Auth Service (`apps/auth-service/.env`)
```env
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:123456@localhost:5432/auth_db?schema=public"
JWT_ACCESS_SECRET="7f3a9b2c8d1e4f6a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c"
JWT_REFRESH_SECRET="a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef"
REDIS_URL="redis://localhost:6379"
RABBITMQ_URL="amqp://localhost:5672"
BCRYPT_ROUNDS=12
ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173"
```

### User Service (`apps/user-service/.env`)
```env
PORT=3002
NODE_ENV=development
DATABASE_URL="postgresql://postgres:123456@localhost:5432/user_db"
JWT_ACCESS_SECRET="7f3a9b2c8d1e4f6a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c"
AUTH_SERVICE_URL="http://localhost:3001"
AWS_REGION="us-east-1"
AWS_S3_BUCKET_NAME="cube-avatars"
AWS_ACCESS_KEY_ID="minioadmin"
AWS_SECRET_ACCESS_KEY="minioadmin"
```

### Product Service (`apps/product-service/.env`)
```env
PORT=3004
NODE_ENV=development
DATABASE_URL="postgresql://postgres:123456@localhost:5432/product_db"
JWT_ACCESS_SECRET="7f3a9b2c8d1e4f6a9b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c"
RABBITMQ_URL="amqp://localhost:5672"
AWS_REGION="us-east-1"
AWS_S3_BUCKET_NAME="cube-products"
AWS_ACCESS_KEY_ID="minioadmin"
AWS_SECRET_ACCESS_KEY="minioadmin"
```

### Search Service (`apps/search-service/.env`)
```env
PORT=3005
NODE_ENV=development
ELASTICSEARCH_NODE="http://localhost:9200"
RABBITMQ_URL="amqp://localhost:5672"
PRODUCT_SERVICE_URL="http://localhost:3004"
```

### Notification Service (`apps/notification-service/.env`)
```env
PORT=3003
NODE_ENV=development
RABBITMQ_URL="amqp://localhost:5672"
SMS_API_KEY="your-api-key"
SMS_SENDER_ID="your-sender-id"
SENDER_EMAIL="your-smtp-email@gmail.com"
SENDER_APP_PASSWORD="your-smtp-app-password"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SENDER_NAME="Cube System"
```

---

## 🧪 Testing

All services are configured with standard testing utilities. Testing is orchestrated by Turborepo at the monorepo root.

### Available Test Scripts
*   **Run All Tests (Unit & Integration)**:
    ```bash
    pnpm test
    ```
*   **Lint Check Codebase**:
    ```bash
    pnpm lint
    ```
*   **Compile / Build All Modules**:
    ```bash
    pnpm build
    ```

### Postman Collections (Manual Testing)
The codebase includes a pre-configured Postman collection containing end-to-end endpoints:
*   File Location: [cube.postman_collection.json](file:///e:/project/cube/server/cube.postman_collection.json)
*   **How to import**:
    1. Open Postman.
    2. Click **Import** in the upper left corner.
    3. Select and drag `cube.postman_collection.json` into the import field.
    4. Configure the collection variable `baseUrl` to point to the API Gateway (`http://localhost:3000/v1`).

---

## 🔒 Security & Compliance

*   **Cryptographic Standards**: All passwords are encrypted with `bcrypt` (12 rounds). Secret tokens (e.g., MFA secrets) are stored using `AES-256-GCM` encryption.
*   **JWT session isolation**: Uses short-lived Access tokens (15m) and long-lived Refresh tokens (7d). Token Rotation voids entire login sessions on reuse detection.
*   **Distributed Rate Limiting**: Distributed rate-limiting is implemented in Redis to restrict endpoints:
    *   General Routes: Max 100 requests per 15 min per IP.
    *   Auth Login Routes: Max 5 attempts per 15 min per IP. Temporary account lock for 30 minutes on consecutive failures.
    *   MFA Code Submissions: Max 5 attempts per 5 min.
*   **SQL Injection & XSS Guardrails**: Prisma ORM sanitizes queries to prevent SQL injections. Central validation pipes enforce typed inputs, stripping un-whitelisted attributes.
*   **GDPR Compliance**: Built-in support for profile data extraction in JSON format and soft-deletion logic ensuring user data is entirely purged after a 30-day retention window.

---

## 🚀 Deployment

The system is compiled using Docker multi-stage builds. In production environments, services should be deployed in a Kubernetes cluster or managed via docker-compose configurations.

### Kubernetes Architecture Strategy
*   **Ingress & Routing**: Deploy an Ingress Controller (e.g., Nginx Ingress or Traefik) to route traffic to the `api-gateway` service.
*   **Horizontal Pod Autoscaler (HPA)**: Configure HPA based on CPU/Memory usage metrics. Ensure critical services (Auth, Product) maintain a minimum of 3 replicas.
*   **PgBouncer Connection Pooling**: Use PgBouncer as a middleware between PostgreSQL and Prisma client replicas to maintain healthy database connection pool limits.
*   **TLS/mTLS**: Enforce TLS 1.3 at the Ingress proxy and establish secure mTLS internal configurations (e.g., via Linkerd or Istio Service Mesh).

---

## 🗺️ Roadmap & Unimplemented Services

The platform specification encompasses subsequent development phases implementing the following domains:

### 1. Commerce & Checkout Lifecycle
```
                 ┌────────────────────────────────────────────────────────┐
                 │                   CHECKOUT INITIATED                   │
                 └──────────────────────────┬─────────────────────────────┘
                                            │
                                            ▼
                                     [  PENDING  ]
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     │ PaymentIntent Created                       │ User Cancels
                     ▼                                             ▼
            [ PAYMENT_PENDING ]                             [  CANCELLED  ]
                     │                                             │
      ┌──────────────┴──────────────┐                              │
      │ Stripe Succeeded            │ Stripe Failed / Cancelled    │
      ▼                             ▼                              │
  [  PAID  ]               [ PAYMENT_FAILED ]                      │
      │                             │                              │
      ▼                             ▼                              │
[ PROCESSING ]                 (Terminal)                      (Terminal)
      │
      ▼ (Label Created)
[  SHIPPED  ]
      │
      ▼ (Carrier Webhook)
[ DELIVERED ]
      │
      ▼ (Admin Refund)
[  REFUNDED  ] (Terminal)
```

*   **Cart Service**: Redis-backed temporary item caching with TTL expiry configurations.
*   **Order Service & State Machine**: Implements transactional ordering flows via a rigorous order lifecycle state machine (Order creation, Stripe payments, invoicing, and inventory release rollbacks).
*   **Offer Service**: Tiered discounts, BOGO (Buy One Get One), and Flash Sales support built on database optimistic locking.
*   **Payment Service**: Secure payment handling via Stripe Elements and webhook verification.

### 2. Fulfillment
*   **Inventory Service**: Strict stock limits, pessimistic concurrency locking (`SELECT FOR UPDATE`), and inventory audit trails.
*   **Shipping Service**: Carrier rate quotes integration (UPS, FedEx, DHL) and shipping label generators.

### 3. Support & Analytics
*   **Live Chat Support**: Real-time WebSockets support with agents availability registry in Redis.
*   **Analytics Engine**: Asynchronous Kafka event streaming into a ClickHouse storage cluster to analyze sales trends and CSAT scores.

---

## 🤝 Contributing

We welcome contributions from the community! To contribute:
1. Fork this repository.
2. Create a branch: `git checkout -b feat/your-awesome-feature` or `git checkout -b fix/your-bugfix`.
3. Commit your changes following standard guidelines.
4. Push to the branch and submit a Pull Request.

Please make sure your code passes formatting and linting:
```bash
pnpm lint
pnpm build
```

## 👥 Authors
*   **Md. Shakil Hossain** - Development and Architecture.
