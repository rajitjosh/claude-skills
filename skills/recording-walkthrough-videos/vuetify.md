# Vuetify apps (Vue SPAs): walkthrough notes

| Problem | Fix |
|---|---|
| `getByLabel` misses a v-select | Locate the v-select by its wrapper or role instead |
| `getByLabel` matches two elements on fields with a clear or eye icon | Use `getByRole("textbox", { name })` |
| Autocomplete suggestions aren't found by role | They aren't role "option". Locate the list items in the menu |
| Autocomplete value assertion fails | The `input` keeps the typed search text. Assert on the field's displayed text |
| Editable table cell assertion fails | Cells are inputs: assert with `toHaveValue`, not text |
| `spot()` outline doesn't show | Table rows and buttons inside clipping Vuetify cards hide outlines. Spot the table or the whole button bar instead |
