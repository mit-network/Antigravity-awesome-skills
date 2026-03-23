---
name: jobgpt
description: "Job search automation, auto apply, resume generation, application tracking, salary intelligence, and recruiter outreach using the JobGPT MCP server."
risk: safe
source: community
date_added: "2026-03-23"
---

# JobGPT — Job Search Automation

## Overview

JobGPT connects your AI assistant to a complete job search automation platform via the JobGPT MCP server. It provides 34 tools covering job search, auto-apply, resume generation, application tracking, salary intelligence, and recruiter outreach — so you can manage your entire job hunt from your AI coding assistant.

Built by [6figr.com](https://6figr.com/jobgpt-ai), the platform supports 150+ countries with salary data, job matching, and automated applications.

## When to Use This Skill

- You want to **search for jobs** with filters like titles, locations, salary, remote, H1B sponsorship
- You want to **auto-apply** to jobs automatically
- You want to **generate a tailored resume** for a specific job application
- You want to **track your job applications** across multiple job hunts
- You want to **find recruiters or referrers** at target companies and send outreach emails
- You want to **import a job** from LinkedIn, Greenhouse, Lever, Workday, or any job board URL
- You want to **check your salary** and compare compensation across roles

## Setup

This skill requires the JobGPT MCP server:

1. Sign up at [6figr.com/jobgpt-ai](https://6figr.com/jobgpt-ai)
2. Go to Account → MCP Integrations → Generate API Key
3. Add the MCP server to your AI tool:

```bash
npx jobgpt-mcp-server
```

Set the `JOBGPT_API_KEY` environment variable to your API key.

## Examples

### Find Remote Jobs

> "Find remote senior React jobs paying over $150k"

The skill uses `search_jobs` with title, remote, and salary filters to find matching positions, then presents results with company, title, location, salary range, and key skills.

### Auto-Apply to Jobs

> "Auto-apply to the top 5 matches from my job hunt"

The skill checks your resume is uploaded, uses `match_jobs` to find new matches, then triggers `apply_to_job` for each selected application. It monitors progress with `get_application_stats`.

### Generate a Tailored Resume

> "Generate a tailored resume for this Google application"

The skill calls `generate_resume_for_job` to create an AI-optimized resume targeting the specific job's requirements, then provides the download link via `get_generated_resume`.

### Import and Apply from a URL

> "Apply to this job for me - https://boards.greenhouse.io/company/jobs/12345"

The skill uses `import_job_by_url` to import the job from any supported platform (LinkedIn, Greenhouse, Lever, Workday), adds it to applications, and optionally triggers auto-apply.

### Recruiter Outreach

> "Find recruiters for this job and draft an outreach email"

The skill finds recruiters with `get_job_recruiters`, helps craft a personalized message, and sends it with `send_outreach`.

### Check Application Stats

> "Show my application stats for the last 7 days"

The skill uses `get_application_stats` for an aggregated overview — total counts by status, auto-apply metrics, and pipeline progress.

## Best Practices

- **Check credits first** — Auto-apply and resume generation consume credits. Use `get_credits` before batch operations.
- **Complete your profile** — Run `get_profile` first and fill in missing fields with `update_profile` for better job matches.
- **Upload a resume before applying** — Use `list_resumes` to check, and `upload_resume` if needed.
- **Use job hunts for ongoing searches** — Create a job hunt with `create_job_hunt` to save filters and get continuous matches.
- **Use `get_application` for saved jobs** — If a user asks about a job they've already saved, use `get_application` instead of `get_job`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Missing Authorization header" | Ensure `JOBGPT_API_KEY` env var is set with your API key |
| "Insufficient credits" | Check balance with `get_credits`. Purchase more at 6figr.com/account |
| Auto-apply not working | Ensure a resume is uploaded and the job hunt has auto-apply enabled |
| No job matches found | Broaden your search filters (fewer titles, more locations, wider salary range) |

## Additional Resources

- [JobGPT Platform](https://6figr.com/jobgpt-ai) — Sign up and manage your account
- [MCP Server Repo](https://github.com/6figr-com/jobgpt-mcp-server) — Source code and setup guides
- [Skills Repo](https://github.com/6figr-com/skills) — This skill's source
- [npm Package](https://www.npmjs.com/package/jobgpt-mcp-server) — Install via npm
