-- Quita buckets de módulos retirados (lab, proveedores, reclamos).
-- NO correr mientras Disk IO Budget esté agotado.
-- Si hay objetos, vaciar primero en Storage UI; este DELETE de buckets
-- falla si el bucket no está vacío (no borra archivos en masa).

DELETE FROM storage.buckets
WHERE id IN ('lab-reports', 'supplier-docs', 'complaint-photos')
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = storage.buckets.id
  );
