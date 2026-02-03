#!/usr/bin/env node

/**
 * Architecture Diagram Generator
 * 
 * Generate Mermaid.js architecture diagrams from code analysis or templates.
 * 
 * Usage:
 *   npx tsx scripts/architecture-diagram-generator.ts [options]
 *   npm run arch-diagram -- [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

// Diagram Templates
const TEMPLATES = {
    microservices: `\`\`\`mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Web[Web App]
        Mobile[Mobile App]
        API_Client[API Client]
    end
    
    subgraph Gateway["API Gateway"]
        LB[Load Balancer]
        Auth[Auth Service]
        RateLimit[Rate Limiter]
    end
    
    subgraph Services["Microservices"]
        UserSvc[User Service]
        OrderSvc[Order Service]
        PaymentSvc[Payment Service]
        NotifySvc[Notification Service]
    end
    
    subgraph Data["Data Layer"]
        UserDB[(User DB)]
        OrderDB[(Order DB)]
        PaymentDB[(Payment DB)]
        Cache[(Redis Cache)]
        Queue[(Message Queue)]
    end
    
    Web --> LB
    Mobile --> LB
    API_Client --> LB
    LB --> Auth
    Auth --> RateLimit
    RateLimit --> UserSvc
    RateLimit --> OrderSvc
    RateLimit --> PaymentSvc
    
    UserSvc --> UserDB
    UserSvc --> Cache
    OrderSvc --> OrderDB
    OrderSvc --> Queue
    PaymentSvc --> PaymentDB
    PaymentSvc --> Queue
    Queue --> NotifySvc
\`\`\``,

    'event-driven': `\`\`\`mermaid
flowchart LR
    subgraph Producers["Event Producers"]
        API[API Service]
        Worker[Worker Service]
        Scheduler[Scheduler]
    end
    
    subgraph EventBus["Event Bus"]
        Kafka[Apache Kafka]
        Topics[Topics]
    end
    
    subgraph Consumers["Event Consumers"]
        Analytics[Analytics Service]
        Notifications[Notification Service]
        Indexer[Search Indexer]
        Archiver[Data Archiver]
    end
    
    subgraph Storage["Storage"]
        ES[(Elasticsearch)]
        S3[(S3 Archive)]
        DW[(Data Warehouse)]
    end
    
    API --> Kafka
    Worker --> Kafka
    Scheduler --> Kafka
    
    Kafka --> Analytics
    Kafka --> Notifications
    Kafka --> Indexer
    Kafka --> Archiver
    
    Analytics --> DW
    Indexer --> ES
    Archiver --> S3
\`\`\``,

    layered: `\`\`\`mermaid
flowchart TB
    subgraph Presentation["Presentation Layer"]
        UI[React/Next.js UI]
        API_Routes[API Routes]
    end
    
    subgraph Application["Application Layer"]
        Controllers[Controllers]
        Services[Services]
        DTOs[DTOs/Validators]
    end
    
    subgraph Domain["Domain Layer"]
        Entities[Entities]
        Repositories[Repository Interfaces]
        DomainServices[Domain Services]
    end
    
    subgraph Infrastructure["Infrastructure Layer"]
        RepoImpl[Repository Implementations]
        Database[(PostgreSQL)]
        ExternalAPIs[External APIs]
        Cache[(Redis)]
    end
    
    UI --> API_Routes
    API_Routes --> Controllers
    Controllers --> Services
    Services --> DTOs
    Services --> DomainServices
    DomainServices --> Entities
    DomainServices --> Repositories
    Repositories --> RepoImpl
    RepoImpl --> Database
    RepoImpl --> Cache
    Services --> ExternalAPIs
\`\`\``,

    hexagonal: `\`\`\`mermaid
flowchart TB
    subgraph Adapters_In["Driving Adapters (Primary)"]
        REST[REST API]
        GraphQL[GraphQL]
        CLI[CLI]
        Events_In[Event Handlers]
    end
    
    subgraph Ports_In["Inbound Ports"]
        UseCases[Use Cases]
    end
    
    subgraph Core["Domain Core"]
        Domain[Domain Model]
        DomainServices[Domain Services]
    end
    
    subgraph Ports_Out["Outbound Ports"]
        RepoPort[Repository Ports]
        NotifyPort[Notification Ports]
        ExternalPort[External Service Ports]
    end
    
    subgraph Adapters_Out["Driven Adapters (Secondary)"]
        DB[(Database)]
        Email[Email Service]
        SMS[SMS Service]
        ThirdParty[Third Party APIs]
    end
    
    REST --> UseCases
    GraphQL --> UseCases
    CLI --> UseCases
    Events_In --> UseCases
    
    UseCases --> Domain
    UseCases --> DomainServices
    DomainServices --> Domain
    
    DomainServices --> RepoPort
    DomainServices --> NotifyPort
    DomainServices --> ExternalPort
    
    RepoPort --> DB
    NotifyPort --> Email
    NotifyPort --> SMS
    ExternalPort --> ThirdParty
\`\`\``,

    'saas-multi-tenant': `\`\`\`mermaid
flowchart TB
    subgraph Tenants["Tenants"]
        T1[Tenant A]
        T2[Tenant B]
        T3[Tenant C]
    end
    
    subgraph Edge["Edge Layer"]
        CDN[CDN / CloudFlare]
        DNS[DNS Routing]
    end
    
    subgraph Gateway["Multi-Tenant Gateway"]
        TenantResolver[Tenant Resolver]
        AuthN[Authentication]
        RateLimit[Rate Limiting per Tenant]
    end
    
    subgraph App["Application Tier"]
        API[Shared API Service]
        Workers[Background Workers]
    end
    
    subgraph Data["Data Isolation"]
        subgraph Shared["Shared Database"]
            Schema[Tenant Schema Isolation]
        end
        subgraph Dedicated["Dedicated Databases"]
            T1_DB[(Tenant A DB)]
            T2_DB[(Tenant B DB)]
        end
    end
    
    subgraph Billing["Billing & Metering"]
        Usage[Usage Tracking]
        Stripe[Stripe Integration]
    end
    
    T1 --> CDN
    T2 --> CDN
    T3 --> CDN
    CDN --> DNS
    DNS --> TenantResolver
    TenantResolver --> AuthN
    AuthN --> RateLimit
    RateLimit --> API
    API --> Schema
    API --> T1_DB
    API --> T2_DB
    API --> Workers
    Workers --> Usage
    Usage --> Stripe
\`\`\``,

    cicd: `\`\`\`mermaid
flowchart LR
    subgraph Dev["Development"]
        Code[Code Push]
        PR[Pull Request]
    end
    
    subgraph CI["Continuous Integration"]
        Lint[Lint & Format]
        Test[Unit Tests]
        Build[Build]
        Security[Security Scan]
    end
    
    subgraph CD["Continuous Deployment"]
        Staging[Deploy Staging]
        E2E[E2E Tests]
        Approval{Manual Approval}
        Prod[Deploy Production]
    end
    
    subgraph Infra["Infrastructure"]
        K8s[Kubernetes]
        Monitor[Monitoring]
        Alerts[Alerting]
    end
    
    Code --> PR
    PR --> Lint
    Lint --> Test
    Test --> Build
    Build --> Security
    Security --> Staging
    Staging --> E2E
    E2E --> Approval
    Approval -->|Approved| Prod
    Prod --> K8s
    K8s --> Monitor
    Monitor --> Alerts
\`\`\``
};

interface GenerateOptions {
    template?: string;
    output?: string;
    list?: boolean;
    projectPath?: string;
}

async function listTemplates(): Promise<void> {
    console.log(chalk.bold.cyan('\n📐 Available Architecture Templates:\n'));

    Object.keys(TEMPLATES).forEach((name, index) => {
        console.log(chalk.yellow(`  ${index + 1}. ${name}`));
    });

    console.log(chalk.gray('\nUsage: npx tsx scripts/architecture-diagram-generator.ts --template <name>\n'));
}

async function generateDiagram(options: GenerateOptions): Promise<void> {
    const spinner = ora('Generating architecture diagram...').start();

    try {
        const templateName = options.template || 'microservices';
        const template = TEMPLATES[templateName as keyof typeof TEMPLATES];

        if (!template) {
            spinner.fail(chalk.red(`Template "${templateName}" not found`));
            console.log(chalk.gray('Use --list to see available templates'));
            process.exit(1);
        }

        const outputContent = `# Architecture Diagram: ${templateName}

Generated by Senior Architect Expert Skill

## Diagram

${template}

## Description

This diagram represents a **${templateName}** architecture pattern.

### Key Components

- See the diagram above for component relationships
- Each box represents a service or component
- Arrows indicate data/request flow

### Best Practices

1. Follow the separation of concerns shown in the layers
2. Ensure proper error handling between components
3. Implement circuit breakers for external dependencies
4. Add observability (logs, metrics, traces) at each layer

---

*Generated on ${new Date().toISOString()}*
`;

        const outputPath = options.output || `architecture-${templateName}.md`;
        fs.writeFileSync(outputPath, outputContent, 'utf-8');

        spinner.succeed(chalk.green(`Generated ${outputPath}`));
        console.log(chalk.cyan(`\n📄 Preview:\n`));
        console.log(chalk.gray(template.slice(0, 500) + '...\n'));

    } catch (error) {
        spinner.fail(chalk.red('Failed to generate diagram'));
        console.error(error);
        process.exit(1);
    }
}

async function analyzeProject(projectPath: string): Promise<void> {
    const spinner = ora('Analyzing project structure...').start();

    try {
        const packageJsonPath = path.join(projectPath, 'package.json');

        if (!fs.existsSync(packageJsonPath)) {
            spinner.warn(chalk.yellow('No package.json found, generating generic diagram'));
            await generateDiagram({ template: 'layered' });
            return;
        }

        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        // Detect architecture pattern based on dependencies
        let detectedPattern = 'layered';

        if (deps['@nestjs/microservices'] || deps['moleculer']) {
            detectedPattern = 'microservices';
        } else if (deps['kafka-node'] || deps['kafkajs'] || deps['amqplib']) {
            detectedPattern = 'event-driven';
        } else if (deps['next'] || deps['express'] || deps['fastify']) {
            detectedPattern = 'layered';
        }

        spinner.succeed(chalk.green(`Detected pattern: ${detectedPattern}`));

        await generateDiagram({ template: detectedPattern, output: `architecture-${path.basename(projectPath)}.md` });

    } catch (error) {
        spinner.fail(chalk.red('Failed to analyze project'));
        console.error(error);
        process.exit(1);
    }
}

// CLI Configuration
program
    .name('arch-diagram')
    .description('Generate Mermaid.js architecture diagrams')
    .version('1.0.0');

program
    .option('-t, --template <name>', 'Template to use (microservices, event-driven, layered, hexagonal, saas-multi-tenant, cicd)')
    .option('-o, --output <path>', 'Output file path')
    .option('-l, --list', 'List available templates')
    .option('-p, --project <path>', 'Analyze project and suggest architecture')
    .action(async (options: GenerateOptions) => {
        console.log(chalk.bold.magenta('\n🏗️  Architecture Diagram Generator\n'));

        if (options.list) {
            await listTemplates();
        } else if (options.projectPath) {
            await analyzeProject(options.projectPath);
        } else {
            await generateDiagram(options);
        }
    });

program.parse();
