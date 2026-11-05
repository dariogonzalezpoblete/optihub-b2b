# Reglas Permanentes de Desarrollo y Seguridad - Marcos de Marca / OptiHub B2B

## Reglas de Ambientes y Seguridad (Obligatorias)
- **Aislamiento de Producción**: Las pruebas de **MUTACIÓN** (`PATCH`, `POST`, `DELETE` con cualquier token) y la creación de usuarios de prueba se realizan **ÚNICA Y EXCLUSIVAMENTE en el entorno de STAGING**.
- **Solo Lectura en Producción**: En producción únicamente se permiten operaciones de **SOLO LECTURA** (`SELECT` / `GET`), auditorías pasivas y generación de snapshots.
- **Validación de Host**: Antes de ejecutar cualquier script contra bases de datos, se debe imprimir y verificar el host para garantizar que no corresponde al proyecto de producción.
- **Protección de Datos y Secretos**: Ninguna credencial de `service_role`, claves secretas o archivos `.env*` deben ser versionados en Git.
