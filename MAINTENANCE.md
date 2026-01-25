# Repository Maintenance Protocol

To ensure consistency and quality, the following steps MUST be performed for **every single change** involving skills or documentation.

## 1. Skill Creation & Modification

- [ ] **Check Duplicates**: Before adding a skill, check `skills_index.json` or `ls skills/` to ensure it doesn't exist.
- [ ] **Folder Structure**: Each skill must have its own folder in `skills/<skill-name>`.
- [ ] **SKILL.md**: Every skill directory MUST contain a `SKILL.md` file with valid frontmatter:

  ```markdown
  ---
  name: Skill Name
  description: Brief description.
  ---
  ```

## 2. Validation & Indexing (CRITICAL)

Running the scripts is **MANDATORY** after any change to `skills/`.

- [ ] **Validate Skills**: Run the validation script to check for formatting errors.

  ```bash
  python3 scripts/validate_skills.py
  ```

- [ ] **Generate Index**: Update `skills_index.json`. This is the source of truth for the agent.

  ```bash
  python3 scripts/generate_index.py
  ```

## 3. Documentation Updates

- [ ] **Update README**: Run the automation script to sync counts and the registry table and also the number of skills

  ```bash
  python3 scripts/update_readme.py
  ```

- [ ] **Credits & Sources**: If the skill was imported from a community repo, add a credit link in `# Credits & Sources` manually if needed.
  - Example: `- **[repo-name](url)**: Source for [skill-name].`

## 4. Git Operations

- [ ] **Check Status**: `git status` to see what changed.
- [ ] **Add All Files**: Ensure new skill folders are added (`git add skills/`).
- [ ] **Commit**: Use a descriptive Conventional Commit message (e.g., `feat: add new security skills`, `docs: update readme count`).
- [ ] **Push**: `git push` to origin. **NEVER FORGET THIS.**

## 5. Agent Artifacts (Internal)

- [ ] **Walkthrough**: Update `walkthrough.md` in the brain/artifact directory to reflect the session's achievements.

## 6. Release Management

When creating a new version release:

- [ ] **Tag**: Create an annotated git tag.

  ```bash
  git tag -a vX.Y.Z -m "Release X.Y.Z: Title"
  ```

- [ ] **Push Tag**:

  ```bash
  git push origin vX.Y.Z
  ```

- [ ] **Set Default Repo**: Ensure the `gh` CLI knows the upstream repo (crucial if you have multiple remotes).

  ```bash
  gh repo set-default sickn33/antigravity-awesome-skills
  ```

- [ ] **Create GitHub Release**: This creates the visible release on GitHub.

  ```bash
  gh release create vX.Y.Z --title "Release X.Y.Z: Title" --generate-notes
  ```
