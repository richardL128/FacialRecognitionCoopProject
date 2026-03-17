# Cursor-Specific Instructions

## .cursorrules File
Copy the contents of `.llm/tuning/general_rules.md` into a `.cursorrules` file
at the project root so Cursor automatically applies them.

## Cursor Context Tips
- Add `.llm/` folder to Cursor's context with `@folder`
- Pin `.llm/CONVENTIONS.md` as a permanent context doc
- Use `@codebase` when asking about existing patterns

## Recommended Cursor Settings for This Project
- Enable "always include open files in context"
- Set context window to maximum
- Index the full project (including .llm/ docs)
