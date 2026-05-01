# API reference

REST endpoints exposed by the Books API gateway. All requests require a
bearer JWT in the `Authorization` header. See [[architecture]] for how
requests are routed inside the system.

## Reading lists

### `GET /lists`

Returns every list owned by the authenticated user.

```json
{
  "lists": [
    { "id": "ls_a1b2", "title": "To read", "bookCount": 12 }
  ]
}
```

### `GET /lists/:id`

Returns one list with its books.

```json
{
  "id": "ls_a1b2",
  "title": "To read",
  "books": [
    { "id": "bk_c3d4", "title": "Designing Data-Intensive Applications", "author": "Martin Kleppmann" }
  ]
}
```

### `POST /lists`

Creates a new list. Title is required, max 80 chars.

```json
{ "title": "Currently reading" }
```

Returns the created list with its assigned `id`.

### `POST /lists/:id/books`

Adds a book to a list. The book must not already appear in the list (see
the invariant in [[architecture]]).

```json
{ "title": "...", "author": "..." }
```

Returns the new book entry.

## Errors

All errors use the same envelope:

```json
{ "error": { "code": "list_not_found", "message": "..." } }
```

| code               | HTTP | When |
|--------------------|-----:|------|
| `unauthenticated`  |  401 | Missing / invalid JWT |
| `rate_limited`     |  429 | Too many requests in a window |
| `list_not_found`   |  404 | The list id doesn't exist or isn't yours |
| `book_already_in_list` | 409 | Adding a duplicate book |
| `validation`       |  400 | Body shape is wrong |

The choice to use a typed error code instead of a translated message is
ADR-1 in [[design-decisions]].
