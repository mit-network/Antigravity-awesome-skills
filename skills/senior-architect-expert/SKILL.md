---
name: senior-architect-expert
description: Complete toolkit for senior architects with modern tools and best practices. Triggers on architecture, system design, monorepo, cost optimization, SaaS scaling, microservices, database design, API design, cloud infrastructure, and tech stack decisions.
---

# Senior Architect Expert

Complete toolkit for senior architects with modern tools and best practices.

Compatible with: **Antigravity** | **Claude Code** | **Gemini CLI** | **OpenCode** | **Cursor** | **Codex**

---

## Quick Start

```bash
# Install dependencies
npm install

# Run architecture diagram generator
npm run arch-diagram -- --template microservices

# Run project analyzer
npm run project-architect -- ./your-project

# Run dependency analyzer
npm run dep-analyzer -- ./your-project
```

---

## Main Capabilities

This skill provides four core capabilities through automated scripts:

```bash
# Script 1: Architecture Diagram Generator
npx tsx scripts/architecture-diagram-generator.ts [options]

# Script 2: Project Architect
npx tsx scripts/project-architect.ts [project-path] [options]

# Script 3: Dependency Analyzer
npx tsx scripts/dependency-analyzer.ts [project-path] [options]

# Script 4: Cost Auditor
node scripts/cost-auditor.js <tokens> <requests> <model>
```

---

## Core Capabilities

### 1. Architecture Diagram Generator

Automated Mermaid.js diagram generation from templates or project analysis.

**Features:**
- 6 built-in templates (microservices, event-driven, layered, hexagonal, saas-multi-tenant, cicd)
- Project analysis for automatic pattern detection
- Markdown output with embedded diagrams

**Usage:**
```bash
# List available templates
npx tsx scripts/architecture-diagram-generator.ts --list

# Generate microservices diagram
npx tsx scripts/architecture-diagram-generator.ts --template microservices

# Analyze project and generate appropriate diagram
npx tsx scripts/architecture-diagram-generator.ts --project ./my-project

# Custom output path
npx tsx scripts/architecture-diagram-generator.ts --template hexagonal --output ./docs/architecture.md
```

### 2. Project Architect

Comprehensive project analysis with health scoring and recommendations.

**Features:**
- Structure analysis
- Dependency assessment
- Pattern detection
- Security checks
- Maintainability scoring

**Usage:**
```bash
# Analyze current directory
npx tsx scripts/project-architect.ts .

# Analyze with report output
npx tsx scripts/project-architect.ts ./my-project --output report.md

# JSON output for CI/CD
npx tsx scripts/project-architect.ts ./my-project --json
```

### 3. Dependency Analyzer

Advanced dependency analysis for security, licensing, and optimization.

**Features:**
- Risk assessment per package
- Circular dependency detection
- Duplicate functionality detection
- Category breakdown
- Optimization recommendations

**Usage:**
```bash
# Analyze dependencies
npx tsx scripts/dependency-analyzer.ts ./my-project

# Generate markdown report
npx tsx scripts/dependency-analyzer.ts . --output deps-report.md

# JSON output
npx tsx scripts/dependency-analyzer.ts . --json
```

### 4. AI API Cost Auditor

Calculate monthly AI API costs with latest 2026 pricing (15 models).

**Available Models:**
- **OpenAI:** gpt-4.5, gpt-4o, gpt-4o-mini, o1, o1-mini
- **Anthropic:** claude-4, claude-3.5, claude-3.5-haiku
- **Google:** gemini-2.0-pro, gemini-flash, gemini-flash-lite
- **DeepSeek:** deepseek-v3, deepseek-r1
- **Mistral:** mistral-large, mistral-medium
- **Meta:** llama-3.3-70b, llama-3.2-8b

**Usage:**
```bash
# Calculate cost for 50K requests at 2K tokens using GPT-4o
node scripts/cost-auditor.js 2000 50000 gpt-4o

# Compare DeepSeek R1 for reasoning workloads
node scripts/cost-auditor.js 3000 100000 deepseek-r1

# High-volume with Gemini Flash Lite
node scripts/cost-auditor.js 1500 500000 gemini-flash-lite
```

---

## Reference Documentation

### Architecture Patterns
Comprehensive guide in [references/architecture_patterns.md](references/architecture_patterns.md):
- Microservices patterns
- Event-driven architecture
- Hexagonal architecture
- Domain-Driven Design
- CQRS & Event Sourcing
- Anti-patterns to avoid

### System Design Workflows
Complete workflows in [references/system_design_workflows.md](references/system_design_workflows.md):
- Design interview framework
- Capacity planning
- Database design process
- API design workflow
- Performance optimization
- Scalability patterns

### Tech Decision Guide
Technical reference in [references/tech_decision_guide.md](references/tech_decision_guide.md):
- Technology stack selection
- Security considerations
- Cloud platform comparison
- Database selection matrix
- Troubleshooting guide

### Monorepo Patterns
Enterprise monorepo guide in [references/monorepo-patterns.md](references/monorepo-patterns.md):
- Turborepo + Vite configuration
- 140+ package management
- Build optimization
- CI/CD pipelines

---

## Tech Stack

**Languages:** TypeScript, JavaScript, Python, Go, Swift, Kotlin

**Frontend:** React, Next.js, React Native, Flutter

**Backend:** Node.js, Express, Fastify, GraphQL, REST APIs

**Database:** PostgreSQL, Prisma, Drizzle, NeonDB, Supabase

**DevOps:** Docker, Kubernetes, Terraform, GitHub Actions, CircleCI

**Cloud:** AWS, GCP, Azure

---

## Development Workflow

### 1. Setup and Configuration
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
```

### 2. Run Quality Checks
```bash
# Analyze project structure
npm run project-architect

# Check dependencies
npm run dep-analyzer

# Review recommendations and apply fixes
```

### 3. Implement Best Practices
Follow patterns documented in:
- `references/architecture_patterns.md`
- `references/system_design_workflows.md`
- `references/tech_decision_guide.md`

---

## Best Practices Summary

### Code Quality
- Follow established patterns
- Write comprehensive tests
- Document architectural decisions
- Review code regularly

### Performance
- Measure before optimizing
- Use appropriate caching
- Optimize critical paths
- Monitor in production

### Security
- Validate all inputs
- Use parameterized queries
- Implement proper authentication
- Keep dependencies updated

### Maintainability
- Write clear, readable code
- Use consistent naming conventions
- Add helpful comments
- Keep solutions simple

---

## Common Commands

```bash
# Development
npm run dev           # Watch mode
npm run build         # Build TypeScript
npm run lint          # Lint code
npm run typecheck     # Type check

# Analysis
npm run arch-diagram -- --list
npm run project-architect -- .
npm run dep-analyzer -- .
npm run cost-auditor -- 2000 50000 gpt-4o

# Getting help
npx tsx scripts/architecture-diagram-generator.ts --help
npx tsx scripts/project-architect.ts --help
npx tsx scripts/dependency-analyzer.ts --help
node scripts/cost-auditor.js --help
```

---

## Troubleshooting

### Common Issues
Check the comprehensive troubleshooting section in [references/tech_decision_guide.md](references/tech_decision_guide.md#troubleshooting-guide).

### Getting Help
1. Review reference documentation
2. Check script output messages
3. Consult tech stack documentation
4. Review error logs

---

## Resources

- **Pattern Reference:** [references/architecture_patterns.md](references/architecture_patterns.md)
- **Workflow Guide:** [references/system_design_workflows.md](references/system_design_workflows.md)
- **Technical Guide:** [references/tech_decision_guide.md](references/tech_decision_guide.md)
- **Monorepo Guide:** [references/monorepo-patterns.md](references/monorepo-patterns.md)
- **Tool Scripts:** `scripts/` directory

---

*Built for AI coding assistants - Antigravity, Claude Code, Gemini CLI, OpenCode, Cursor, Codex*
