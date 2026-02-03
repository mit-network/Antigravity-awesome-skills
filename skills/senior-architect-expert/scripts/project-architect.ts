#!/usr/bin/env node

/**
 * Project Architect
 * 
 * Analyze project structure, detect anti-patterns, and provide architecture recommendations.
 * 
 * Usage:
 *   npx tsx scripts/project-architect.ts [project-path] [options]
 *   npm run project-architect -- [project-path] [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const program = new Command();

interface AnalysisResult {
    score: number;
    category: string;
    issues: string[];
    recommendations: string[];
}

interface FrameworkInfo {
    name: string;
    version?: string;
    type: 'frontend' | 'backend' | 'fullstack' | 'unknown';
}

interface ProjectAnalysis {
    projectName: string;
    projectPath: string;
    healthScore: number;
    detectedFrameworks: FrameworkInfo[];
    structure: AnalysisResult;
    dependencies: AnalysisResult;
    patterns: AnalysisResult;
    security: AnalysisResult;
    maintainability: AnalysisResult;
    frameworkBestPractices: AnalysisResult;
}

// Anti-patterns to check
const ANTI_PATTERNS = {
    godFiles: {
        pattern: /^(utils?|helpers?|common|shared|misc|stuff)\.(?:ts|js|tsx|jsx)$/i,
        message: 'Potential "God File" detected - consider breaking into smaller, focused modules',
        severity: 'warning'
    },
    circularRisk: {
        pattern: /^index\.(?:ts|js)$/,
        message: 'Multiple index files may cause circular dependency risks',
        severity: 'info'
    },
    deepNesting: {
        maxDepth: 5,
        message: 'Deep directory nesting detected - consider flattening structure',
        severity: 'warning'
    },
    largeFiles: {
        maxLines: 500,
        message: 'Large file detected - consider splitting into smaller modules',
        severity: 'warning'
    }
};

// Best practices checks
const BEST_PRACTICES = {
    hasTests: { path: /tests?|__tests__|spec/i, required: true },
    hasConfig: { path: /config/i, required: true },
    hasDocs: { files: ['README.md', 'docs'], required: true },
    hasLinting: { files: ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js'], required: true },
    hasTypescript: { files: ['tsconfig.json'], required: false },
    hasCI: { files: ['.github/workflows', '.gitlab-ci.yml', 'Jenkinsfile', '.circleci'], required: false },
    hasDocker: { files: ['Dockerfile', 'docker-compose.yml'], required: false }
};

async function analyzeStructure(projectPath: string): Promise<AnalysisResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for standard directories
    const expectedDirs = ['src', 'lib', 'app'];
    const hasSrcDir = expectedDirs.some(dir => fs.existsSync(path.join(projectPath, dir)));

    if (!hasSrcDir) {
        issues.push('No standard source directory (src/, lib/, app/) found');
        recommendations.push('Organize code into a src/ or app/ directory');
        score -= 10;
    }

    // Check for tests
    const hasTests = fs.existsSync(path.join(projectPath, 'tests')) ||
        fs.existsSync(path.join(projectPath, '__tests__')) ||
        fs.existsSync(path.join(projectPath, 'test'));

    if (!hasTests) {
        issues.push('No test directory found');
        recommendations.push('Add a tests/ or __tests__/ directory for unit tests');
        score -= 15;
    }

    // Check for config organization
    const configFiles = await glob('*.config.{js,ts,json}', { cwd: projectPath });
    if (configFiles.length > 5) {
        issues.push(`${configFiles.length} config files in root - consider organizing`);
        recommendations.push('Move configuration files to a config/ directory');
        score -= 5;
    }

    // Check directory depth
    const allFiles = await glob('**/*', { cwd: projectPath, ignore: ['node_modules/**', '.git/**'] });
    const maxDepth = Math.max(...allFiles.map(f => f.split('/').length));

    if (maxDepth > ANTI_PATTERNS.deepNesting.maxDepth) {
        issues.push(`Deep nesting detected (${maxDepth} levels)`);
        recommendations.push('Flatten directory structure to improve navigation');
        score -= 10;
    }

    return {
        score: Math.max(0, score),
        category: 'Project Structure',
        issues,
        recommendations
    };
}

async function analyzeDependencies(projectPath: string): Promise<AnalysisResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        return {
            score: 50,
            category: 'Dependencies',
            issues: ['No package.json found'],
            recommendations: ['Initialize npm project with npm init']
        };
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = Object.keys(packageJson.dependencies || {});
    const devDeps = Object.keys(packageJson.devDependencies || {});
    const allDeps = [...deps, ...devDeps];

    // Check for outdated patterns
    const legacyPackages = allDeps.filter(d =>
        ['moment', 'lodash', 'request', 'node-sass'].includes(d)
    );

    if (legacyPackages.length > 0) {
        issues.push(`Legacy packages detected: ${legacyPackages.join(', ')}`);
        recommendations.push('Consider: moment → date-fns/dayjs, lodash → native/lodash-es, request → axios/fetch, node-sass → sass');
        score -= 10;
    }

    // Check for security-sensitive packages
    const securityRisks = allDeps.filter(d =>
        ['eval', 'serialize-javascript'].includes(d)
    );

    if (securityRisks.length > 0) {
        issues.push(`Security-sensitive packages: ${securityRisks.join(', ')}`);
        recommendations.push('Review usage of security-sensitive packages');
        score -= 15;
    }

    // Check for duplicate functionality
    const duplicateFunctionality = [];
    if (allDeps.includes('axios') && allDeps.includes('node-fetch')) {
        duplicateFunctionality.push('axios + node-fetch (HTTP clients)');
    }
    if (allDeps.includes('moment') && allDeps.includes('date-fns')) {
        duplicateFunctionality.push('moment + date-fns (date libraries)');
    }

    if (duplicateFunctionality.length > 0) {
        issues.push(`Duplicate functionality: ${duplicateFunctionality.join(', ')}`);
        recommendations.push('Consolidate to single package per functionality');
        score -= 5;
    }

    // Check for proper dev dependencies
    const misplacedDevDeps = deps.filter(d =>
        ['jest', 'mocha', 'chai', 'typescript', 'eslint', 'prettier', '@types/'].some(dev => d.includes(dev))
    );

    if (misplacedDevDeps.length > 0) {
        issues.push(`Dev dependencies in production: ${misplacedDevDeps.join(', ')}`);
        recommendations.push('Move development tools to devDependencies');
        score -= 10;
    }

    // Check dependency count
    if (deps.length > 50) {
        issues.push(`High dependency count (${deps.length} production deps)`);
        recommendations.push('Audit dependencies and remove unused packages');
        score -= 5;
    }

    return {
        score: Math.max(0, score),
        category: 'Dependencies',
        issues,
        recommendations
    };
}

async function analyzePatterns(projectPath: string): Promise<AnalysisResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for god files
    const srcPath = fs.existsSync(path.join(projectPath, 'src')) ? 'src' : '.';
    const files = await glob(`${srcPath}/**/*.{ts,tsx,js,jsx}`, {
        cwd: projectPath,
        ignore: ['node_modules/**']
    });

    for (const file of files) {
        const basename = path.basename(file);
        if (ANTI_PATTERNS.godFiles.pattern.test(basename)) {
            issues.push(`Potential god file: ${file}`);
            score -= 5;
        }
    }

    // Check for large files
    for (const file of files.slice(0, 50)) { // Check first 50 files
        try {
            const fullPath = path.join(projectPath, file);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lineCount = content.split('\n').length;

            if (lineCount > ANTI_PATTERNS.largeFiles.maxLines) {
                issues.push(`Large file (${lineCount} lines): ${file}`);
                score -= 3;
            }
        } catch {
            // Skip files that can't be read
        }
    }

    // Check for missing architecture patterns
    const hasDomainDir = fs.existsSync(path.join(projectPath, 'src/domain')) ||
        fs.existsSync(path.join(projectPath, 'domain'));
    const hasServicesDir = fs.existsSync(path.join(projectPath, 'src/services')) ||
        fs.existsSync(path.join(projectPath, 'services'));

    if (!hasDomainDir && !hasServicesDir && files.length > 20) {
        issues.push('No clear domain/services separation');
        recommendations.push('Consider organizing code into domain/ and services/ directories');
        score -= 10;
    }

    if (issues.length > 0) {
        recommendations.push('Review references/architecture_patterns.md for best practices');
    }

    return {
        score: Math.max(0, score),
        category: 'Architecture Patterns',
        issues,
        recommendations
    };
}

async function analyzeSecurity(projectPath: string): Promise<AnalysisResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for .env in git
    const gitignorePath = path.join(projectPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
        if (!gitignore.includes('.env')) {
            issues.push('.env not in .gitignore');
            recommendations.push('Add .env to .gitignore to prevent secret leaks');
            score -= 20;
        }
    } else {
        issues.push('No .gitignore file');
        recommendations.push('Create .gitignore with standard exclusions');
        score -= 15;
    }

    // Check for hardcoded secrets (basic check)
    const srcPath = fs.existsSync(path.join(projectPath, 'src')) ? 'src' : '.';
    const jsFiles = await glob(`${srcPath}/**/*.{ts,tsx,js,jsx}`, {
        cwd: projectPath,
        ignore: ['node_modules/**', '*.test.*', '*.spec.*']
    });

    for (const file of jsFiles.slice(0, 30)) {
        try {
            const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
            const secretPatterns = [
                /api[_-]?key\s*[:=]\s*['"][^'"]{20,}['"]/i,
                /secret\s*[:=]\s*['"][^'"]{10,}['"]/i,
                /password\s*[:=]\s*['"][^'"]+['"]/i
            ];

            for (const pattern of secretPatterns) {
                if (pattern.test(content)) {
                    issues.push(`Potential hardcoded secret in: ${file}`);
                    score -= 10;
                    break;
                }
            }
        } catch {
            // Skip files that can't be read
        }
    }

    // Check for security headers (Next.js/Express)
    const hasSecurityConfig = fs.existsSync(path.join(projectPath, 'next.config.js')) ||
        fs.existsSync(path.join(projectPath, 'helmet'));

    if (!hasSecurityConfig && jsFiles.length > 10) {
        recommendations.push('Consider adding security headers with helmet or next.config.js');
    }

    return {
        score: Math.max(0, score),
        category: 'Security',
        issues,
        recommendations
    };
}

async function analyzeMaintainability(projectPath: string): Promise<AnalysisResult> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for README
    if (!fs.existsSync(path.join(projectPath, 'README.md'))) {
        issues.push('No README.md');
        recommendations.push('Add README.md with project documentation');
        score -= 15;
    }

    // Check for linting
    const hasLint = ['.eslintrc', '.eslintrc.js', '.eslintrc.json', 'eslint.config.js']
        .some(f => fs.existsSync(path.join(projectPath, f)));

    if (!hasLint) {
        issues.push('No ESLint configuration');
        recommendations.push('Add ESLint for code quality');
        score -= 10;
    }

    // Check for formatting
    const hasFormat = ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js']
        .some(f => fs.existsSync(path.join(projectPath, f)));

    if (!hasFormat) {
        issues.push('No Prettier configuration');
        recommendations.push('Add Prettier for consistent formatting');
        score -= 5;
    }

    // Check for TypeScript
    if (!fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
        recommendations.push('Consider migrating to TypeScript for better maintainability');
        score -= 5;
    }

    // Check for CI/CD
    const hasCI = fs.existsSync(path.join(projectPath, '.github/workflows')) ||
        fs.existsSync(path.join(projectPath, '.gitlab-ci.yml'));

    if (!hasCI) {
        recommendations.push('Add CI/CD pipeline for automated testing');
        score -= 5;
    }

    return {
        score: Math.max(0, score),
        category: 'Maintainability',
        issues,
        recommendations
    };
}

// Framework detection and best practices
interface FrameworkBestPractice {
    name: string;
    check: (projectPath: string, packageJson: any) => Promise<{ passed: boolean; message: string }>;
    severity: 'error' | 'warning' | 'info';
}

const FRAMEWORK_DETECTION: Record<string, { deps: string[]; type: 'frontend' | 'backend' | 'fullstack' }> = {
    'Next.js': { deps: ['next'], type: 'fullstack' },
    'React': { deps: ['react', 'react-dom'], type: 'frontend' },
    'Vue': { deps: ['vue'], type: 'frontend' },
    'Angular': { deps: ['@angular/core'], type: 'frontend' },
    'Svelte': { deps: ['svelte'], type: 'frontend' },
    'SvelteKit': { deps: ['@sveltejs/kit'], type: 'fullstack' },
    'Nuxt': { deps: ['nuxt'], type: 'fullstack' },
    'Remix': { deps: ['@remix-run/react'], type: 'fullstack' },
    'Astro': { deps: ['astro'], type: 'fullstack' },
    'NestJS': { deps: ['@nestjs/core'], type: 'backend' },
    'Express': { deps: ['express'], type: 'backend' },
    'Fastify': { deps: ['fastify'], type: 'backend' },
    'Hono': { deps: ['hono'], type: 'backend' },
    'Koa': { deps: ['koa'], type: 'backend' },
    'tRPC': { deps: ['@trpc/server'], type: 'backend' },
    'GraphQL': { deps: ['graphql', 'apollo-server', '@apollo/server'], type: 'backend' },
    'Prisma': { deps: ['prisma', '@prisma/client'], type: 'backend' },
    'Drizzle': { deps: ['drizzle-orm'], type: 'backend' }
};

const NEXTJS_BEST_PRACTICES: FrameworkBestPractice[] = [
    {
        name: 'App Router structure',
        check: async (projectPath) => {
            const hasAppDir = fs.existsSync(path.join(projectPath, 'app')) ||
                fs.existsSync(path.join(projectPath, 'src/app'));
            return {
                passed: hasAppDir,
                message: hasAppDir ? 'Using App Router (recommended)' : 'Consider migrating to App Router for better performance'
            };
        },
        severity: 'info'
    },
    {
        name: 'next.config.js exists',
        check: async (projectPath) => {
            const hasConfig = fs.existsSync(path.join(projectPath, 'next.config.js')) ||
                fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
                fs.existsSync(path.join(projectPath, 'next.config.ts'));
            return { passed: hasConfig, message: hasConfig ? 'Next.js config present' : 'Add next.config.js for customization' };
        },
        severity: 'warning'
    },
    {
        name: 'Image optimization',
        check: async (projectPath) => {
            const files = await glob('**/*.{tsx,jsx}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let usesNextImage = false;
            for (const file of files.slice(0, 30)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes("from 'next/image'") || content.includes('from "next/image"')) {
                        usesNextImage = true;
                        break;
                    }
                } catch { }
            }
            return { passed: usesNextImage, message: usesNextImage ? 'Using next/image for optimization' : 'Use next/image instead of <img> for automatic optimization' };
        },
        severity: 'warning'
    },
    {
        name: 'Dynamic imports for code splitting',
        check: async (projectPath) => {
            const files = await glob('**/*.{tsx,jsx,ts,js}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let usesDynamic = false;
            for (const file of files.slice(0, 30)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes("from 'next/dynamic'") || content.includes('import(')) {
                        usesDynamic = true;
                        break;
                    }
                } catch { }
            }
            return { passed: usesDynamic, message: usesDynamic ? 'Using dynamic imports' : 'Consider next/dynamic for code splitting large components' };
        },
        severity: 'info'
    },
    {
        name: 'Environment variables',
        check: async (projectPath) => {
            const hasEnvExample = fs.existsSync(path.join(projectPath, '.env.example')) ||
                fs.existsSync(path.join(projectPath, '.env.local.example'));
            return { passed: hasEnvExample, message: hasEnvExample ? '.env.example present' : 'Add .env.example for documentation' };
        },
        severity: 'warning'
    },
    {
        name: 'Metadata API usage',
        check: async (projectPath) => {
            const layoutFiles = await glob('**/layout.{tsx,jsx,ts,js}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let usesMetadata = false;
            for (const file of layoutFiles) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes('export const metadata') || content.includes('generateMetadata')) {
                        usesMetadata = true;
                        break;
                    }
                } catch { }
            }
            return { passed: usesMetadata, message: usesMetadata ? 'Using Metadata API for SEO' : 'Use Metadata API in layout.tsx for better SEO' };
        },
        severity: 'warning'
    }
];

const REACT_BEST_PRACTICES: FrameworkBestPractice[] = [
    {
        name: 'React 18+ features',
        check: async (projectPath, packageJson) => {
            const reactVersion = packageJson.dependencies?.react || '';
            const is18Plus = reactVersion.includes('18') || reactVersion.includes('19');
            return { passed: is18Plus, message: is18Plus ? 'Using React 18+' : 'Consider upgrading to React 18+ for concurrent features' };
        },
        severity: 'info'
    },
    {
        name: 'Component organization',
        check: async (projectPath) => {
            const hasComponents = fs.existsSync(path.join(projectPath, 'src/components')) ||
                fs.existsSync(path.join(projectPath, 'components'));
            return { passed: hasComponents, message: hasComponents ? 'Components directory present' : 'Organize components in a /components directory' };
        },
        severity: 'warning'
    },
    {
        name: 'Hooks organization',
        check: async (projectPath) => {
            const hasHooks = fs.existsSync(path.join(projectPath, 'src/hooks')) ||
                fs.existsSync(path.join(projectPath, 'hooks'));
            return { passed: hasHooks, message: hasHooks ? 'Hooks directory present' : 'Consider organizing custom hooks in /hooks directory' };
        },
        severity: 'info'
    },
    {
        name: 'Avoiding prop drilling',
        check: async (projectPath, packageJson) => {
            const hasStateManagement = ['zustand', 'redux', 'jotai', 'recoil', '@tanstack/react-query', 'swr']
                .some(pkg => packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg]);
            return { passed: hasStateManagement, message: hasStateManagement ? 'State management solution present' : 'Consider zustand or TanStack Query to avoid prop drilling' };
        },
        severity: 'info'
    },
    {
        name: 'Error boundaries',
        check: async (projectPath) => {
            const files = await glob('**/*.{tsx,jsx}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let hasErrorBoundary = false;
            for (const file of files.slice(0, 50)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes('componentDidCatch') || content.includes('ErrorBoundary') || content.includes('error.tsx')) {
                        hasErrorBoundary = true;
                        break;
                    }
                } catch { }
            }
            return { passed: hasErrorBoundary, message: hasErrorBoundary ? 'Error boundary present' : 'Add ErrorBoundary components for graceful error handling' };
        },
        severity: 'warning'
    }
];

const NESTJS_BEST_PRACTICES: FrameworkBestPractice[] = [
    {
        name: 'Module organization',
        check: async (projectPath) => {
            const moduleFiles = await glob('**/*.module.ts', { cwd: projectPath, ignore: ['node_modules/**'] });
            return { passed: moduleFiles.length > 1, message: moduleFiles.length > 1 ? `${moduleFiles.length} modules found` : 'Create feature modules for better organization' };
        },
        severity: 'warning'
    },
    {
        name: 'DTO validation',
        check: async (projectPath, packageJson) => {
            const hasValidation = packageJson.dependencies?.['class-validator'] && packageJson.dependencies?.['class-transformer'];
            return { passed: !!hasValidation, message: hasValidation ? 'Using class-validator for DTOs' : 'Add class-validator and class-transformer for DTO validation' };
        },
        severity: 'error'
    },
    {
        name: 'Exception filters',
        check: async (projectPath) => {
            const files = await glob('**/*.ts', { cwd: projectPath, ignore: ['node_modules/**'] });
            let hasFilters = false;
            for (const file of files.slice(0, 50)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes('@Catch') || content.includes('ExceptionFilter')) {
                        hasFilters = true;
                        break;
                    }
                } catch { }
            }
            return { passed: hasFilters, message: hasFilters ? 'Exception filters present' : 'Add global exception filter for consistent error handling' };
        },
        severity: 'warning'
    },
    {
        name: 'Guards for authentication',
        check: async (projectPath) => {
            const guardFiles = await glob('**/*.guard.ts', { cwd: projectPath, ignore: ['node_modules/**'] });
            return { passed: guardFiles.length > 0, message: guardFiles.length > 0 ? `${guardFiles.length} guards found` : 'Add guards for route protection' };
        },
        severity: 'warning'
    },
    {
        name: 'Swagger documentation',
        check: async (projectPath, packageJson) => {
            const hasSwagger = packageJson.dependencies?.['@nestjs/swagger'];
            return { passed: !!hasSwagger, message: hasSwagger ? 'Swagger documentation enabled' : 'Add @nestjs/swagger for API documentation' };
        },
        severity: 'info'
    },
    {
        name: 'Configuration module',
        check: async (projectPath, packageJson) => {
            const hasConfig = packageJson.dependencies?.['@nestjs/config'];
            return { passed: !!hasConfig, message: hasConfig ? 'Using @nestjs/config' : 'Add @nestjs/config for environment management' };
        },
        severity: 'warning'
    }
];

const EXPRESS_BEST_PRACTICES: FrameworkBestPractice[] = [
    {
        name: 'Security middleware (helmet)',
        check: async (projectPath, packageJson) => {
            const hasHelmet = packageJson.dependencies?.helmet;
            return { passed: !!hasHelmet, message: hasHelmet ? 'Using helmet for security' : 'Add helmet for security headers' };
        },
        severity: 'error'
    },
    {
        name: 'CORS configuration',
        check: async (projectPath, packageJson) => {
            const hasCors = packageJson.dependencies?.cors;
            return { passed: !!hasCors, message: hasCors ? 'CORS middleware present' : 'Add cors package for CORS handling' };
        },
        severity: 'warning'
    },
    {
        name: 'Rate limiting',
        check: async (projectPath, packageJson) => {
            const hasRateLimit = packageJson.dependencies?.['express-rate-limit'] || packageJson.dependencies?.['rate-limiter-flexible'];
            return { passed: !!hasRateLimit, message: hasRateLimit ? 'Rate limiting configured' : 'Add rate limiting to prevent abuse' };
        },
        severity: 'warning'
    },
    {
        name: 'Request validation',
        check: async (projectPath, packageJson) => {
            const hasValidation = ['zod', 'joi', 'yup', 'express-validator'].some(pkg => packageJson.dependencies?.[pkg]);
            return { passed: hasValidation, message: hasValidation ? 'Request validation present' : 'Add zod or joi for request validation' };
        },
        severity: 'error'
    },
    {
        name: 'Error handling middleware',
        check: async (projectPath) => {
            const files = await glob('**/*.{ts,js}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let hasErrorHandler = false;
            for (const file of files.slice(0, 30)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes('(err, req, res, next)') || content.includes('(error, req, res, next)')) {
                        hasErrorHandler = true;
                        break;
                    }
                } catch { }
            }
            return { passed: hasErrorHandler, message: hasErrorHandler ? 'Error handler present' : 'Add centralized error handling middleware' };
        },
        severity: 'warning'
    },
    {
        name: 'Structured logging',
        check: async (projectPath, packageJson) => {
            const hasLogger = ['pino', 'winston', 'bunyan', 'morgan'].some(pkg => packageJson.dependencies?.[pkg]);
            return { passed: hasLogger, message: hasLogger ? 'Structured logging configured' : 'Add pino or winston for structured logging' };
        },
        severity: 'info'
    }
];

const FASTIFY_BEST_PRACTICES: FrameworkBestPractice[] = [
    {
        name: 'Schema validation',
        check: async (projectPath, packageJson) => {
            const hasSchema = packageJson.dependencies?.['@fastify/type-provider-typebox'] ||
                packageJson.dependencies?.['@sinclair/typebox'] ||
                packageJson.dependencies?.['zod'];
            return { passed: !!hasSchema, message: hasSchema ? 'Schema validation present' : 'Add @fastify/type-provider-typebox for validation' };
        },
        severity: 'warning'
    },
    {
        name: 'Plugin architecture',
        check: async (projectPath) => {
            const files = await glob('**/*.{ts,js}', { cwd: projectPath, ignore: ['node_modules/**'] });
            let usesPlugins = false;
            for (const file of files.slice(0, 30)) {
                try {
                    const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
                    if (content.includes('fastify.register') || content.includes('.register(')) {
                        usesPlugins = true;
                        break;
                    }
                } catch { }
            }
            return { passed: usesPlugins, message: usesPlugins ? 'Using plugin architecture' : 'Use fastify.register for modular code' };
        },
        severity: 'info'
    },
    {
        name: 'Security plugins',
        check: async (projectPath, packageJson) => {
            const hasSecurity = packageJson.dependencies?.['@fastify/helmet'] || packageJson.dependencies?.['@fastify/cors'];
            return { passed: !!hasSecurity, message: hasSecurity ? 'Security plugins present' : 'Add @fastify/helmet and @fastify/cors' };
        },
        severity: 'error'
    }
];

function detectFrameworks(packageJson: any): FrameworkInfo[] {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const detected: FrameworkInfo[] = [];

    for (const [framework, config] of Object.entries(FRAMEWORK_DETECTION)) {
        const hasFramework = config.deps.some(dep => deps[dep]);
        if (hasFramework) {
            const depName = config.deps.find(dep => deps[dep]);
            detected.push({
                name: framework,
                version: depName ? deps[depName] : undefined,
                type: config.type
            });
        }
    }

    return detected;
}

async function analyzeFrameworkBestPractices(projectPath: string): Promise<{ result: AnalysisResult; frameworks: FrameworkInfo[] }> {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;
    let frameworks: FrameworkInfo[] = [];

    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        return {
            result: {
                score: 100,
                category: 'Framework Best Practices',
                issues: [],
                recommendations: ['No package.json found - cannot detect frameworks']
            },
            frameworks: []
        };
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    frameworks = detectFrameworks(packageJson);

    if (frameworks.length === 0) {
        return {
            result: {
                score: 100,
                category: 'Framework Best Practices',
                issues: [],
                recommendations: ['No recognized frameworks detected']
            },
            frameworks: []
        };
    }

    // Get best practices for detected frameworks
    const practicesMap: Record<string, FrameworkBestPractice[]> = {
        'Next.js': NEXTJS_BEST_PRACTICES,
        'React': REACT_BEST_PRACTICES,
        'NestJS': NESTJS_BEST_PRACTICES,
        'Express': EXPRESS_BEST_PRACTICES,
        'Fastify': FASTIFY_BEST_PRACTICES
    };

    for (const framework of frameworks) {
        const practices = practicesMap[framework.name];
        if (!practices) continue;

        for (const practice of practices) {
            try {
                const result = await practice.check(projectPath, packageJson);
                if (!result.passed) {
                    if (practice.severity === 'error') {
                        issues.push(`[${framework.name}] ❌ ${practice.name}: ${result.message}`);
                        score -= 15;
                    } else if (practice.severity === 'warning') {
                        issues.push(`[${framework.name}] ⚠️ ${practice.name}: ${result.message}`);
                        score -= 8;
                    } else {
                        recommendations.push(`[${framework.name}] ${result.message}`);
                        score -= 3;
                    }
                }
            } catch {
                // Skip check if it fails
            }
        }
    }

    return {
        result: {
            score: Math.max(0, score),
            category: 'Framework Best Practices',
            issues,
            recommendations
        },
        frameworks
    };
}

function calculateHealthScore(analyses: AnalysisResult[]): number {
    const totalScore = analyses.reduce((sum, a) => sum + a.score, 0);
    return Math.round(totalScore / analyses.length);
}

function getHealthEmoji(score: number): string {
    if (score >= 90) return '🟢';
    if (score >= 70) return '🟡';
    if (score >= 50) return '🟠';
    return '🔴';
}

function printReport(analysis: ProjectAnalysis): void {
    console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
    console.log(chalk.bold.cyan('  🏗️  PROJECT ARCHITECTURE ANALYSIS'));
    console.log(chalk.bold.cyan('═'.repeat(60)));

    console.log(chalk.white(`\nProject: ${chalk.bold(analysis.projectName)}`));
    console.log(chalk.white(`Path: ${chalk.gray(analysis.projectPath)}`));

    // Show detected frameworks
    if (analysis.detectedFrameworks.length > 0) {
        console.log(chalk.white(`\n🔧 Detected Frameworks:`));
        analysis.detectedFrameworks.forEach(fw => {
            const badge = fw.type === 'fullstack' ? '🌐' : fw.type === 'frontend' ? '🎨' : '⚙️';
            console.log(chalk.cyan(`   ${badge} ${fw.name} ${fw.version || ''} (${fw.type})`));
        });
    }

    console.log(chalk.bold(`\n${getHealthEmoji(analysis.healthScore)} Overall Health Score: ${analysis.healthScore}/100\n`));

    const allResults = [
        analysis.structure,
        analysis.dependencies,
        analysis.patterns,
        analysis.security,
        analysis.maintainability,
        analysis.frameworkBestPractices
    ];

    for (const result of allResults) {
        console.log(chalk.bold(`\n${getHealthEmoji(result.score)} ${result.category}: ${result.score}/100`));
        console.log(chalk.gray('─'.repeat(50)));

        if (result.issues.length > 0) {
            console.log(chalk.yellow('\n  Issues:'));
            result.issues.forEach(issue => {
                console.log(chalk.yellow(`    ⚠️  ${issue}`));
            });
        }

        if (result.recommendations.length > 0) {
            console.log(chalk.green('\n  Recommendations:'));
            result.recommendations.forEach(rec => {
                console.log(chalk.green(`    💡 ${rec}`));
            });
        }
    }

    // Summary
    const totalIssues = allResults.reduce((sum, r) => sum + r.issues.length, 0);
    const totalRecs = allResults.reduce((sum, r) => sum + r.recommendations.length, 0);

    console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
    console.log(chalk.white(`\n📊 Summary:`));
    console.log(chalk.white(`   • ${totalIssues} issues found`));
    console.log(chalk.white(`   • ${totalRecs} recommendations`));
    console.log(chalk.gray(`\n   Generated on ${new Date().toISOString()}\n`));
}

async function generateReport(analysis: ProjectAnalysis, outputPath: string): Promise<void> {
    const allResults = [
        analysis.structure,
        analysis.dependencies,
        analysis.patterns,
        analysis.security,
        analysis.maintainability
    ];

    let report = `# Architecture Analysis Report

**Project:** ${analysis.projectName}  
**Path:** ${analysis.projectPath}  
**Generated:** ${new Date().toISOString()}

---

## ${getHealthEmoji(analysis.healthScore)} Overall Health Score: ${analysis.healthScore}/100

`;

    for (const result of allResults) {
        report += `### ${getHealthEmoji(result.score)} ${result.category}: ${result.score}/100

`;
        if (result.issues.length > 0) {
            report += `**Issues:**\n`;
            result.issues.forEach(issue => {
                report += `- ⚠️ ${issue}\n`;
            });
            report += '\n';
        }

        if (result.recommendations.length > 0) {
            report += `**Recommendations:**\n`;
            result.recommendations.forEach(rec => {
                report += `- 💡 ${rec}\n`;
            });
            report += '\n';
        }
    }

    report += `---

## Next Steps

1. Address critical security issues first
2. Fix structural problems
3. Improve maintainability
4. Review architecture patterns

See \`references/\` for detailed best practices.
`;

    fs.writeFileSync(outputPath, report, 'utf-8');
}

// CLI Configuration
program
    .name('project-architect')
    .description('Analyze project structure and provide architecture recommendations')
    .version('1.0.0')
    .argument('[path]', 'Project path to analyze', '.')
    .option('-o, --output <path>', 'Output report path')
    .option('-v, --verbose', 'Verbose output')
    .option('--json', 'Output as JSON')
    .action(async (projectPath: string, options: { output?: string; verbose?: boolean; json?: boolean }) => {
        const resolvedPath = path.resolve(projectPath);

        if (!fs.existsSync(resolvedPath)) {
            console.error(chalk.red(`Path not found: ${resolvedPath}`));
            process.exit(1);
        }

        console.log(chalk.bold.magenta('\n🏗️  Project Architect\n'));

        const spinner = ora('Analyzing project...').start();

        try {
            const [structure, dependencies, patterns, security, maintainability, frameworkAnalysis] = await Promise.all([
                analyzeStructure(resolvedPath),
                analyzeDependencies(resolvedPath),
                analyzePatterns(resolvedPath),
                analyzeSecurity(resolvedPath),
                analyzeMaintainability(resolvedPath),
                analyzeFrameworkBestPractices(resolvedPath)
            ]);

            const analysis: ProjectAnalysis = {
                projectName: path.basename(resolvedPath),
                projectPath: resolvedPath,
                healthScore: calculateHealthScore([structure, dependencies, patterns, security, maintainability, frameworkAnalysis.result]),
                detectedFrameworks: frameworkAnalysis.frameworks,
                structure,
                dependencies,
                patterns,
                security,
                maintainability,
                frameworkBestPractices: frameworkAnalysis.result
            };

            spinner.succeed('Analysis complete');

            if (options.json) {
                console.log(JSON.stringify(analysis, null, 2));
            } else {
                printReport(analysis);
            }

            if (options.output) {
                await generateReport(analysis, options.output);
                console.log(chalk.green(`\n📄 Report saved to: ${options.output}`));
            }

        } catch (error) {
            spinner.fail('Analysis failed');
            console.error(error);
            process.exit(1);
        }
    });

program.parse();
