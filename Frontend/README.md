# Frontend — Simulación RTV

Interfaz web de la simulación de la Planta de Revisión Técnica Vehicular. Construida con **React + Vite** y **Tailwind CSS**.

## Estructura del Proyecto

```
Frontend/
├── src/
│   ├── App.jsx                  # Rutas de la aplicación
│   ├── main.jsx                 # Punto de entrada
│   ├── index.css                # Estilos globales
│   ├── lib/
│   │   └── utils.js             # Utilidad cn() (clsx + tailwind-merge)
│   ├── components/
│   │   ├── Layout.jsx           # Wrapper con Navbar
│   │   ├── Navbar.jsx           # Barra de navegación (sticky)
│   │   └── ui/
│   │       └── Progress.jsx     # Barra de progreso estilo shadcn/ui
│   ├── context/
│   │   ├── SimulationContext.jsx # Estado global de la simulación
│   │   └── ThemeContext.jsx     # Toggle dark/light mode
│   ├── pages/
│   │   ├── Config.jsx           # Formulario de configuración + barras de progreso
│   │   ├── Statistics.jsx       # Estadísticas globales de la simulación
│   │   ├── Table.jsx            # Vector de estado (tabla paginada)
│   │   └── Graph.jsx            # Gráficos comparativos
│   └── services/
│       ├── api.js               # Instancia Axios con base URL
│       └── simulation.service.js # Métodos de la API
```

## Páginas

### `/config` — Configuración de Simulación
- Formulario con todos los parámetros de la simulación.
- **Inputs de tiempo dobles vinculados**: cada campo de "Hora de Apertura" y "Cierre de Puertas" expone dos inputs sincronizados — **Minutos** y **HH:MM** — que se actualizan mutuamente al editar cualquiera de los dos.
- La semilla (`master_seed`) es un parámetro **oculto** manejado internamente por el backend; no se expone al usuario.
- **Ejecución asincrónica**: al presionar "Ejecutar Simulación", el POST retorna inmediatamente y la página muestra un panel de progreso con dos barras animadas:
  - 📅 **Días simulados**: progreso sobre `max_dias`.
  - ⚡ **Iteraciones acumuladas**: progreso sobre `max_iteraciones`.
- El frontend hace polling a `GET /simulacion/progreso` cada 1.5 s hasta que el estado sea `done`, momento en que navega automáticamente a `/stats`.

### `/stats` — Estadísticas Globales
Primera página que se muestra tras ejecutar una simulación. Muestra:
- **Tiempo de ejecución** real de la simulación (medido por el backend).
- **Promedio de hora de finalización** de jornada (HH:MM).
- **Total de vehículos atendidos** por tipo (Autos / Camionetas).
- **Tiempo promedio de espera en cola** global por tipo de vehículo.
- **Porcentaje de bloqueo de frenos** global por línea (con barra de progreso con colores: verde < 20%, ámbar < 40%, rojo ≥ 40%).
- Botones de acceso rápido a Tabla, Gráficos y descarga de CSV.

> Si se navega directamente a `/stats` sin haber ejecutado una simulación, la página realiza un `GET /estadisticas_globales` automáticamente.

### `/table` — Vector de Estado
Tabla paginada (50 filas por página) del vector de estado por día.

**Características:**
- **Selector de día**: input numérico para navegar entre las jornadas simuladas.
- **Headers en 2 niveles**: fila superior con el nombre del grupo (Llegada Auto, Línea 1, Línea 2, etc.) y fila inferior con etiquetas cortas de columna. **Soporta N líneas dinámicamente** — si la simulación tiene 3 o 4 líneas, los headers aparecen automáticamente.
- **Sticky row inferior**: el **último registro de toda la simulación** está fijo al pie de la tabla, siempre visible sin importar el scroll o el día que se esté consultando.
- **Toggle de formato de tiempo**: botón para alternar entre **Minutos** y **HH:MM:SS** en todas las columnas de tiempo simultáneamente.
- **Celdas vacías**: se muestran como `—` (guión largo).
- **Columna "Iteracion"**: ID global del evento a lo largo de toda la simulación.
- **Clientes Activos**: expandibles con click, mostrando tipo, estado y línea de cada vehículo.
- **Cards superiores**: Fin de Jornada, Autos Atendidos, Camionetas Atendidas, Máxima longitud de cola del día.
- **Selector de columnas**: menú desplegable con grupos de columnas habilitables/deshabilitables. Incluye botón **"Seleccionar todas / Deseleccionar todas"** para gestión rápida (respeta siempre el grupo Base fijo).
- **Botón "Guardar CSV Local"**: solicita al backend que escriba el vector de estado completo en el disco del servidor (`output/vector_de_estado.csv`). El archivo no se descarga al navegador; en cambio se muestra una notificación visual (toast) con el resultado de la operación.

### `/graph` — Análisis de Simulación
Cinco gráficos comparativos entre días:

| # | Gráfico | Tipo |
|---|---------|------|
| 1 | **Top días con mayor bloqueo** de frenos | Barras apiladas por línea |
| 2 | **Top días con mayor tiempo de atención** de servidores | Barras por línea |
| 3 | **Vehículos atendidos por jornada** (autos + camionetas) | Área temporal |
| 4 | **Impacto del Bloqueo en la Espera** — Top N días | ComposedChart (barras + línea, doble eje Y) |
| 5 | **Distribución de Horas de Cierre** | Histograma en intervalos de 5 min |

**Gráfico 4 — Impacto del Bloqueo:**
- Selector de Top N (5 / 10 / 15 / 20 días).
- El frontend solicita solo los N días necesarios al backend (`GET /estadisticas/top_bloqueo?n=N`), evitando transferir el dataset completo.
- Los días se ordenan cronológicamente para que la línea de espera fluya naturalmente.
- Animación desactivada en barras y línea para evitar artefactos al cambiar N.

> Todos los gráficos se adaptan dinámicamente a cualquier cantidad de líneas configuradas.
> Para simulaciones con más de 60 días se activa el **modo agrupado** (semanas, meses, etc.) para mantener la legibilidad.

## Instalación y Uso

El entorno recomendado es Docker Compose (ver README raíz del proyecto). Para desarrollo local sin Docker:

```bash
# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

El servidor de desarrollo corre en `http://localhost:5173` y se conecta a la API en `http://localhost:8000`.

En producción (contenedor Docker), la app es servida por **Nginx** en el puerto `80`.

## Dependencias Principales

| Paquete | Rol |
|---------|-----|
| `react` + `react-dom` | UI framework |
| `vite` | Build tool |
| `react-router-dom` | Enrutamiento SPA |
| `react-hook-form` | Manejo de formularios |
| `axios` | Cliente HTTP |
| `recharts` | Gráficos SVG |
| `@tanstack/react-table` | Tabla headless |
| `lucide-react` | Íconos |
| `sonner` | Notificaciones toast |
| `tailwindcss` | Utilidades CSS |
| `clsx` + `tailwind-merge` | Utilidad `cn()` para componentes shadcn |
