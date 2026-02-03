#!/usr/bin/env node

/**
 * Dependency Analyzer
 * 
 * Analyze package dependencies for security, licensing, and optimization opportunities.
 * 
 * Usage:
 *   npx tsx scripts/dependency-analyzer.ts [project-path] [options]
 *   npm run dep-analyzer -- [project-path] [options]
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

const program = new Command();

interface DependencyInfo {
    name: string;
    version: string;
    type: 'production' | 'development';
    category: string;
    risk: 'low' | 'medium' | 'high';
    notes: string[];
}

interface CircularDep {
    chain: string[];
    severity: 'warning' | 'error';
}

interface AnalysisReport {
    projectPath: string;
    packageCount: number;
    productionDeps: number;
    devDeps: number;
    categories: Record<string, number>;
    risks: {
        high: DependencyInfo[];
        medium: DependencyInfo[];
        low: DependencyInfo[];
    };
    duplicates: string[];
    outdated: string[];
    licenses: Record<string, string[]>;
    recommendations: string[];
    circularDeps: CircularDep[];
}

// Package categorization
const PACKAGE_CATEGORIES: Record<string, string[]> = {
    'UI Framework': ['react', 'vue', 'angular', 'svelte', 'solid-js', 'preact'],
    'Meta Framework': ['next', 'nuxt', 'gatsby', 'remix', 'astro', 'sveltekit'],
    'State Management': ['redux', 'zustand', 'mobx', 'recoil', 'jotai', 'valtio', 'xstate'],
    'HTTP Client': ['axios', 'node-fetch', 'got', 'ky', 'superagent', 'undici'],
    'Testing': ['jest', 'vitest', 'mocha', 'chai', 'cypress', 'playwright', '@testing-library'],
    'Build Tools': ['webpack', 'vite', 'esbuild', 'rollup', 'parcel', 'turbo', 'nx'],
    'Database': ['prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'knex'],
    'Authentication': ['next-auth', 'passport', 'jsonwebtoken', 'bcrypt', 'jose'],
    'Validation': ['zod', 'yup', 'joi', 'class-validator', 'superstruct'],
    'Styling': ['tailwindcss', 'styled-components', 'emotion', 'sass', 'less', 'postcss'],
    'API': ['express', 'fastify', 'hono', 'koa', 'trpc', 'graphql', 'apollo'],
    'Utilities': ['lodash', 'ramda', 'date-fns', 'dayjs', 'uuid', 'nanoid'],
    'Linting': ['eslint', 'prettier', 'biome', 'oxlint'],
    'TypeScript': ['typescript', 'ts-node', 'tsx', '@types/']
};

// Known risk packages
const RISK_PACKAGES: Record<string, { risk: 'high' | 'medium' | 'low'; reason: string }> = {
    'eval': { risk: 'high', reason: 'Allows arbitrary code execution' },
    'serialize-javascript': { risk: 'medium', reason: 'Potential XSS if misused' },
    'moment': { risk: 'low', reason: 'Large bundle size, consider date-fns/dayjs' },
    'request': { risk: 'medium', reason: 'Deprecated, use axios or node-fetch' },
    'node-sass': { risk: 'medium', reason: 'Native bindings issues, use sass (dart-sass)' },
    'lodash': { risk: 'low', reason: 'Consider lodash-es or specific imports' },
    'core-js': { risk: 'low', reason: 'Large polyfill, check if needed' },
    'jquery': { risk: 'low', reason: 'Legacy library, consider modern alternatives' }
};

// License categories
const LICENSE_RISK: Record<string, 'permissive' | 'copyleft' | 'unknown'> = {
    'MIT': 'permissive',
    'ISC': 'permissive',
    'BSD-2-Clause': 'permissive',
    'BSD-3-Clause': 'permissive',
    'Apache-2.0': 'permissive',
    'GPL-2.0': 'copyleft',
    'GPL-3.0': 'copyleft',
    'LGPL-2.1': 'copyleft',
    'LGPL-3.0': 'copyleft',
    'MPL-2.0': 'copyleft',
    'AGPL-3.0': 'copyleft'
};

function categorizePackage(name: string): string {
    for (const [category, packages] of Object.entries(PACKAGE_CATEGORIES)) {
        if (packages.some(pkg => name.startsWith(pkg) || name.includes(pkg))) {
            return category;
        }
    }
    return 'Other';
}

function assessRisk(name: string): { risk: 'low' | 'medium' | 'high'; notes: string[] } {
    const notes: string[] = [];
    let risk: 'low' | 'medium' | 'high' = 'low';

    if (RISK_PACKAGES[name]) {
        risk = RISK_PACKAGES[name].risk;
        notes.push(RISK_PACKAGES[name].reason);
    }

    // Check for scoped packages without types
    if (name.startsWith('@') && !name.startsWith('@types/')) {
        notes.push('Verify TypeScript support');
    }

    return { risk, notes };
}

async function detectCircularDeps(projectPath: string): Promise<CircularDep[]> {
    const circular: CircularDep[] = [];

    // Simple circular dependency detection based on import analysis
    const srcPath = fs.existsSync(path.join(projectPath, 'src')) ? 'src' : '.';
    const files = await glob(`${srcPath}/**/*.{ts,tsx,js,jsx}`, {
        cwd: projectPath,
        ignore: ['node_modules/**', 'dist/**', 'build/**']
    });

    const imports: Map<string, string[]> = new Map();

    for (const file of files.slice(0, 100)) { // Limit for performance
        try {
            const content = fs.readFileSync(path.join(projectPath, file), 'utf-8');
            const importMatches = content.matchAll(/(?:import|from)\s+['"]([^'"]+)['"]/g);
            const fileImports: string[] = [];

            for (const match of importMatches) {
                const importPath = match[1];
                if (importPath.startsWith('.')) {
                    const resolved = path.normalize(path.join(path.dirname(file), importPath));
                    fileImports.push(resolved.replace(/\\/g, '/'));
                }
            }

            imports.set(file.replace(/\\/g, '/'), fileImports);
        } catch {
            // Skip unreadable files
        }
    }

    // Detect cycles using DFS
    function findCycles(start: string, visited: Set<string>, path: string[]): void {
        if (visited.has(start)) {
            const cycleStart = path.indexOf(start);
            if (cycleStart !== -1) {
                circular.push({
                    chain: path.slice(cycleStart),
                    severity: 'warning'
                });
            }
            return;
        }

        visited.add(start);
        path.push(start);

        const deps = imports.get(start) || [];
        for (const dep of deps) {
            for (const [file] of imports) {
                if (file.includes(dep) || dep.includes(file.replace(/\.(ts|tsx|js|jsx)$/, ''))) {
                    findCycles(file, new Set(visited), [...path]);
                }
            }
        }
    }

    for (const [file] of imports) {
        findCycles(file, new Set(), []);
    }

    return circular.slice(0, 10); // Limit to first 10
}

async function analyzeDependencies(projectPath: string): Promise<AnalysisReport> {
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
        throw new Error('No package.json found');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};

    const allDeps: DependencyInfo[] = [];
    const categories: Record<string, number> = {};
    const risks = { high: [] as DependencyInfo[], medium: [] as DependencyInfo[], low: [] as DependencyInfo[] };
    const duplicates: string[] = [];
    const recommendations: string[] = [];
    const licenses: Record<string, string[]> = {};

    // Analyze production dependencies
    for (const [name, version] of Object.entries(deps)) {
        const category = categorizePackage(name);
        const { risk, notes } = assessRisk(name);

        const info: DependencyInfo = {
            name,
            version: version as string,
            type: 'production',
            category,
            risk,
            notes
        };

        allDeps.push(info);
        categories[category] = (categories[category] || 0) + 1;
        risks[risk].push(info);
    }

    // Analyze dev dependencies
    for (const [name, version] of Object.entries(devDeps)) {
        const category = categorizePackage(name);
        const { risk, notes } = assessRisk(name);

        const info: DependencyInfo = {
            name,
            version: version as string,
            type: 'development',
            category,
            risk,
            notes
        };

        allDeps.push(info);
        categories[category] = (categories[category] || 0) + 1;
    }

    // Check for duplicates
    const httpClients = allDeps.filter(d => d.category === 'HTTP Client');
    if (httpClients.length > 1) {
        duplicates.push(`Multiple HTTP clients: ${httpClients.map(d => d.name).join(', ')}`);
        recommendations.push('Consolidate to a single HTTP client (recommended: axios or native fetch)');
    }

    const dateLibs = allDeps.filter(d => ['moment', 'date-fns', 'dayjs', 'luxon'].includes(d.name));
    if (dateLibs.length > 1) {
        duplicates.push(`Multiple date libraries: ${dateLibs.map(d => d.name).join(', ')}`);
        recommendations.push('Consolidate to a single date library (recommended: date-fns)');
    }

    // Check for missing essentials
    const hasTypes = allDeps.some(d => d.name.startsWith('@types/'));
    const hasTypeScript = allDeps.some(d => d.name === 'typescript');
    if (hasTypes && !hasTypeScript) {
        recommendations.push('TypeScript types present but TypeScript not installed');
    }

    const hasLinting = allDeps.some(d => ['eslint', 'biome', 'oxlint'].includes(d.name));
    if (!hasLinting) {
        recommendations.push('Add a linter (eslint, biome, or oxlint) for code quality');
    }

    // Detect circular dependencies
    const circularDeps = await detectCircularDeps(projectPath);

    // Bundle size considerations
    const largePackages = allDeps.filter(d =>
        ['moment', 'lodash', 'core-js', 'rxjs'].includes(d.name) && d.type === 'production'
    );
    if (largePackages.length > 0) {
        recommendations.push(`Large bundle impact packages: ${largePackages.map(d => d.name).join(', ')} - consider tree-shaking or alternatives`);
    }

    return {
        projectPath,
        packageCount: allDeps.length,
        productionDeps: Object.keys(deps).length,
        devDeps: Object.keys(devDeps).length,
        categories,
        risks,
        duplicates,
        outdated: [], // Would need npm outdated or similar
        licenses,
        recommendations,
        circularDeps
    };
}

function printReport(report: AnalysisReport): void {
    console.log(chalk.bold.cyan('\n' + '═'.repeat(60)));
    console.log(chalk.bold.cyan('  📦 DEPENDENCY ANALYSIS REPORT'));
    console.log(chalk.bold.cyan('═'.repeat(60)));

    console.log(chalk.white(`\nProject: ${chalk.gray(report.projectPath)}`));
    console.log(chalk.white(`\n📊 Overview:`));
    console.log(chalk.white(`   • Total packages: ${report.packageCount}`));
    console.log(chalk.white(`   • Production: ${report.productionDeps}`));
    console.log(chalk.white(`   • Development: ${report.devDeps}`));

    // Categories
    console.log(chalk.bold('\n📁 Package Categories:'));
    const sortedCategories = Object.entries(report.categories)
        .sort((a, b) => b[1] - a[1]);

    for (const [category, count] of sortedCategories) {
        const bar = '█'.repeat(Math.min(count, 20));
        console.log(chalk.gray(`   ${category.padEnd(20)} ${bar} ${count}`));
    }

    // Risks
    if (report.risks.high.length > 0) {
        console.log(chalk.bold.red('\n🔴 High Risk Packages:'));
        for (const pkg of report.risks.high) {
            console.log(chalk.red(`   • ${pkg.name}@${pkg.version}`));
            pkg.notes.forEach(note => console.log(chalk.gray(`     └─ ${note}`)));
        }
    }

    if (report.risks.medium.length > 0) {
        console.log(chalk.bold.yellow('\n🟡 Medium Risk Packages:'));
        for (const pkg of report.risks.medium) {
            console.log(chalk.yellow(`   • ${pkg.name}@${pkg.version}`));
            pkg.notes.forEach(note => console.log(chalk.gray(`     └─ ${note}`)));
        }
    }

    // Duplicates
    if (report.duplicates.length > 0) {
        console.log(chalk.bold.yellow('\n⚠️  Duplicate Functionality:'));
        for (const dup of report.duplicates) {
            console.log(chalk.yellow(`   • ${dup}`));
        }
    }

    // Circular Dependencies
    if (report.circularDeps.length > 0) {
        console.log(chalk.bold.red('\n🔄 Circular Dependencies Detected:'));
        for (const circular of report.circularDeps.slice(0, 5)) {
            console.log(chalk.red(`   • ${circular.chain.join(' → ')}`));
        }
    }

    // Recommendations
    if (report.recommendations.length > 0) {
        console.log(chalk.bold.green('\n💡 Recommendations:'));
        for (const rec of report.recommendations) {
            console.log(chalk.green(`   • ${rec}`));
        }
    }

    console.log(chalk.bold.cyan('\n' + '═'.repeat(60) + '\n'));
}

async function generateMarkdownReport(report: AnalysisReport, outputPath: string): Promise<void> {
    let md = `# Dependency Analysis Report

**Project:** ${report.projectPath}  
**Generated:** ${new Date().toISOString()}

## Overview

| Metric | Count |
|--------|-------|
| Total Packages | ${report.packageCount} |
| Production | ${report.productionDeps} |
| Development | ${report.devDeps} |

## Package Categories

| Category | Count |
|----------|-------|
${Object.entries(report.categories)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => `| ${cat} | ${count} |`)
            .join('\n')}

`;

    if (report.risks.high.length > 0) {
        md += `## 🔴 High Risk Packages

${report.risks.high.map(p => `- **${p.name}@${p.version}**\n  - ${p.notes.join('\n  - ')}`).join('\n')}

`;
    }

    if (report.risks.medium.length > 0) {
        md += `## 🟡 Medium Risk Packages

${report.risks.medium.map(p => `- **${p.name}@${p.version}**\n  - ${p.notes.join('\n  - ')}`).join('\n')}

`;
    }

    if (report.duplicates.length > 0) {
        md += `## ⚠️ Duplicate Functionality

${report.duplicates.map(d => `- ${d}`).join('\n')}

`;
    }

    if (report.circularDeps.length > 0) {
        md += `## 🔄 Circular Dependencies

${report.circularDeps.map(c => `- \`${c.chain.join(' → ')}\``).join('\n')}

`;
    }

    if (report.recommendations.length > 0) {
        md += `## 💡 Recommendations

${report.recommendations.map(r => `- ${r}`).join('\n')}
`;
    }

    fs.writeFileSync(outputPath, md, 'utf-8');
}

// CLI Configuration
program
    .name('dep-analyzer')
    .description('Analyze package dependencies for security, licensing, and optimization')
    .version('1.0.0')
    .argument('[path]', 'Project path to analyze', '.')
    .option('-o, --output <path>', 'Output report path')
    .option('--json', 'Output as JSON')
    .option('-v, --verbose', 'Verbose output')
    .action(async (projectPath: string, options: { output?: string; json?: boolean; verbose?: boolean }) => {
        const resolvedPath = path.resolve(projectPath);

        if (!fs.existsSync(resolvedPath)) {
            console.error(chalk.red(`Path not found: ${resolvedPath}`));
            process.exit(1);
        }

        console.log(chalk.bold.magenta('\n📦 Dependency Analyzer\n'));

        const spinner = ora('Analyzing dependencies...').start();

        try {
            const report = await analyzeDependencies(resolvedPath);
            spinner.succeed('Analysis complete');

            if (options.json) {
                console.log(JSON.stringify(report, null, 2));
            } else {
                printReport(report);
            }

            if (options.output) {
                await generateMarkdownReport(report, options.output);
                console.log(chalk.green(`📄 Report saved to: ${options.output}`));
            }

        } catch (error) {
            spinner.fail('Analysis failed');
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
            process.exit(1);
        }
    });

program.parse();
