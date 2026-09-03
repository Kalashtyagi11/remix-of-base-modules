## What will run

A single data deletion against the benefits catalogue table:

```sql
DELETE FROM public.bn_product
 WHERE id = 'ffa77964-f86f-4e04-bd4d-7b7b310450c8'
   AND benefit_code = 'AP'
   AND status = 'DRAFT';
```

Table involved: `bn_product` (one row). No schema change, no other table written.
Every foreign-key child listed above is empty, so nothing cascades and nothing is
blocked.

## Notes

- This runs against the shared live database immediately — it is not undone by
  discarding the draft.
- The status guard means the delete is refused if the product has meanwhile been
  promoted out of Draft.
- No application code changes; the Product Catalog screen simply stops listing it.
- After running I will confirm the row is gone and that the catalogue count dropped
  by one.
