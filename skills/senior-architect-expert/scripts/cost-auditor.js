#!/usr/bin/env node

/**
 * AI API Cost Auditor
 * 
 * Calculate monthly burn for AI APIs based on token usage and request volume.
 * 
 * Usage: node cost-auditor.js <tokens> <requests> <model>
 * 
 * Arguments:
 *   tokens   - Average tokens per request (input + output combined)
 *   requests - Total monthly requests
 *   model    - AI model: gpt-4o | claude-3.5 | gemini-flash
 * 
 * Example:
 *   node cost-auditor.js 2000 50000 gpt-4o
 */

// 2026 Pricing (per 1M tokens) - Updated February 2026
// Sources: OpenAI, Anthropic, Google, DeepSeek, Mistral, Meta official pricing pages
const PRICING = {
  // OpenAI Models
  'gpt-4.5': {
    name: 'GPT-4.5 Turbo (OpenAI)',
    input: 5.00,      // $5.00 per 1M input tokens
    output: 15.00,    // $15.00 per 1M output tokens
    inputRatio: 0.4,
  },
  'gpt-4o': {
    name: 'GPT-4o (OpenAI)',
    input: 2.50,      // $2.50 per 1M input tokens
    output: 10.00,    // $10.00 per 1M output tokens
    inputRatio: 0.4,
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini (OpenAI)',
    input: 0.15,      // $0.15 per 1M input tokens
    output: 0.60,     // $0.60 per 1M output tokens
    inputRatio: 0.4,
  },
  'o1': {
    name: 'o1 Reasoning (OpenAI)',
    input: 15.00,     // $15.00 per 1M input tokens
    output: 60.00,    // $60.00 per 1M output tokens
    inputRatio: 0.3,
  },
  'o1-mini': {
    name: 'o1-mini (OpenAI)',
    input: 3.00,      // $3.00 per 1M input tokens
    output: 12.00,    // $12.00 per 1M output tokens
    inputRatio: 0.3,
  },

  // Anthropic Models
  'claude-4': {
    name: 'Claude 4 Opus (Anthropic)',
    input: 15.00,     // $15.00 per 1M input tokens
    output: 75.00,    // $75.00 per 1M output tokens
    inputRatio: 0.35,
  },
  'claude-3.5': {
    name: 'Claude 3.5 Sonnet (Anthropic)',
    input: 3.00,      // $3.00 per 1M input tokens
    output: 15.00,    // $15.00 per 1M output tokens
    inputRatio: 0.35,
  },
  'claude-3.5-haiku': {
    name: 'Claude 3.5 Haiku (Anthropic)',
    input: 0.80,      // $0.80 per 1M input tokens
    output: 4.00,     // $4.00 per 1M output tokens
    inputRatio: 0.35,
  },

  // Google Models
  'gemini-2.0-pro': {
    name: 'Gemini 2.0 Pro (Google)',
    input: 1.25,      // $1.25 per 1M input tokens
    output: 5.00,     // $5.00 per 1M output tokens
    inputRatio: 0.4,
  },
  'gemini-flash': {
    name: 'Gemini 2.0 Flash (Google)',
    input: 0.075,     // $0.075 per 1M input tokens
    output: 0.30,     // $0.30 per 1M output tokens
    inputRatio: 0.4,
  },
  'gemini-flash-lite': {
    name: 'Gemini 2.0 Flash Lite (Google)',
    input: 0.0375,    // $0.0375 per 1M input tokens
    output: 0.15,     // $0.15 per 1M output tokens
    inputRatio: 0.4,
  },

  // DeepSeek Models (China)
  'deepseek-v3': {
    name: 'DeepSeek V3 (DeepSeek)',
    input: 0.27,      // $0.27 per 1M input tokens
    output: 1.10,     // $1.10 per 1M output tokens
    inputRatio: 0.4,
  },
  'deepseek-r1': {
    name: 'DeepSeek R1 Reasoning (DeepSeek)',
    input: 0.55,      // $0.55 per 1M input tokens
    output: 2.19,     // $2.19 per 1M output tokens
    inputRatio: 0.35,
  },

  // Mistral Models
  'mistral-large': {
    name: 'Mistral Large (Mistral AI)',
    input: 2.00,      // $2.00 per 1M input tokens
    output: 6.00,     // $6.00 per 1M output tokens
    inputRatio: 0.4,
  },
  'mistral-medium': {
    name: 'Mistral Medium (Mistral AI)',
    input: 0.75,      // $0.75 per 1M input tokens
    output: 2.25,     // $2.25 per 1M output tokens
    inputRatio: 0.4,
  },

  // Meta Llama (via cloud providers)
  'llama-3.3-70b': {
    name: 'Llama 3.3 70B (Meta)',
    input: 0.35,      // $0.35 per 1M input tokens (Groq/Together)
    output: 0.40,     // $0.40 per 1M output tokens
    inputRatio: 0.4,
  },
  'llama-3.2-8b': {
    name: 'Llama 3.2 8B (Meta)',
    input: 0.05,      // $0.05 per 1M input tokens
    output: 0.08,     // $0.08 per 1M output tokens
    inputRatio: 0.4,
  },
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-US').format(num);
}

function calculateCost(tokens, requests, modelKey) {
  const model = PRICING[modelKey];
  if (!model) {
    console.error(`\n❌ Unknown model: ${modelKey}`);
    console.error(`\nAvailable models:`);
    Object.keys(PRICING).forEach(key => {
      console.error(`  - ${key}: ${PRICING[key].name}`);
    });
    process.exit(1);
  }

  const totalTokens = tokens * requests;
  const inputTokens = totalTokens * model.inputRatio;
  const outputTokens = totalTokens * (1 - model.inputRatio);

  const inputCost = (inputTokens / 1_000_000) * model.input;
  const outputCost = (outputTokens / 1_000_000) * model.output;
  const totalCost = inputCost + outputCost;

  return {
    model,
    tokens,
    requests,
    totalTokens,
    inputTokens,
    outputTokens,
    inputCost,
    outputCost,
    totalCost,
  };
}

function printReport(result) {
  console.log('\n' + '═'.repeat(60));
  console.log('  🔥 AI API COST AUDITOR - Monthly Burn Report');
  console.log('═'.repeat(60));

  console.log(`\n📊 Model: ${result.model.name}`);
  console.log('─'.repeat(60));

  console.log('\n📈 Usage Metrics:');
  console.log(`   • Tokens per request:    ${formatNumber(result.tokens)}`);
  console.log(`   • Monthly requests:      ${formatNumber(result.requests)}`);
  console.log(`   • Total monthly tokens:  ${formatNumber(result.totalTokens)}`);

  console.log('\n💰 Token Breakdown:');
  console.log(`   • Input tokens:          ${formatNumber(Math.round(result.inputTokens))} (${(result.model.inputRatio * 100).toFixed(0)}%)`);
  console.log(`   • Output tokens:         ${formatNumber(Math.round(result.outputTokens))} (${((1 - result.model.inputRatio) * 100).toFixed(0)}%)`);

  console.log('\n💵 Cost Breakdown:');
  console.log(`   • Input cost:            ${formatCurrency(result.inputCost)}`);
  console.log(`   • Output cost:           ${formatCurrency(result.outputCost)}`);
  console.log('─'.repeat(60));
  console.log(`   🔥 MONTHLY BURN:         ${formatCurrency(result.totalCost)}`);
  console.log(`   📅 ANNUAL PROJECTION:    ${formatCurrency(result.totalCost * 12)}`);

  console.log('\n' + '═'.repeat(60));

  // Cost optimization suggestions
  if (result.totalCost > 1000) {
    console.log('\n⚠️  HIGH COST ALERT - Consider these optimizations:');
    console.log('   • Implement response caching for common queries');
    console.log('   • Use smaller models for simple tasks (routing)');
    console.log('   • Optimize prompts to reduce token usage');
    console.log('   • Batch requests where possible');
  }

  // Compare with alternatives
  console.log('\n📊 Cost Comparison (same usage across models):');
  console.log('─'.repeat(60));

  const comparisons = Object.keys(PRICING)
    .map(key => ({
      key,
      ...calculateCost(result.tokens, result.requests, key),
    }))
    .sort((a, b) => a.totalCost - b.totalCost);

  comparisons.forEach((comp, index) => {
    const indicator = comp.key === Object.keys(PRICING).find(k => PRICING[k] === result.model) ? ' ◀ CURRENT' : '';
    const rank = index === 0 ? ' 💚 CHEAPEST' : '';
    console.log(`   ${comp.model.name.padEnd(30)} ${formatCurrency(comp.totalCost).padStart(12)}${indicator}${rank}`);
  });

  console.log('\n');
}

function printUsage() {
  console.log(`
AI API Cost Auditor - Calculate monthly AI API burn

Usage: node cost-auditor.js <tokens> <requests> <model>

Arguments:
  tokens     Average tokens per request (input + output)
  requests   Total monthly requests  
  model      AI model identifier

Available Models:
${Object.entries(PRICING).map(([key, val]) => `  ${key.padEnd(18)} ${val.name}`).join('\n')}

Examples:
  # Calculate cost for 50K requests at 2K tokens each using GPT-4o
  node cost-auditor.js 2000 50000 gpt-4o

  # Compare Gemini Flash for high-volume use case
  node cost-auditor.js 1500 200000 gemini-flash

  # Estimate Claude costs for enterprise workload
  node cost-auditor.js 3000 100000 claude-3.5
`);
}

// Main execution
const args = process.argv.slice(2);

if (args.length < 3 || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
}

const [tokensArg, requestsArg, modelArg] = args;
const tokens = parseInt(tokensArg, 10);
const requests = parseInt(requestsArg, 10);
const model = modelArg.toLowerCase();

if (isNaN(tokens) || tokens <= 0) {
  console.error('❌ Error: tokens must be a positive number');
  process.exit(1);
}

if (isNaN(requests) || requests <= 0) {
  console.error('❌ Error: requests must be a positive number');
  process.exit(1);
}

const result = calculateCost(tokens, requests, model);
printReport(result);
