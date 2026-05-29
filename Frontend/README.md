# Frontend — Simulación RTV

Interfaz web de la simulación de la Planta de Revisión Técnica Vehicular. Construida con **React + Vite** y **Tailwind CSS**.

## Estructura del Proyecto

```
Frontend/
├── src/
│   ├── App.jsx                  # Rutas de la aplicación
│   ├── main.jsx                 # Punto de entrada
│   ├── index.css                # Estilos globales
│   ├── components/
│   │   ├── Layout.jsx           # Wrapper con Navbar
│   │   └── Navbar.jsx           # Barra de navegación (sticky)
│   ├── context/
│   │   ├── SimulationContext.jsx # Estado global de la simulación
│   │   └── ThemeContext.jsx     # Toggle dark/light mode
│   ├── pages/
│   │   ├── Config.jsx           # Formulario de configuración
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
- Al ejecutar, redirige automáticamente a `/stats`.

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
- **Botón "Descargar CSV"**: descarga el vector de estado completo generado desde memoria (sin re-simular).

### `/graph` — Análisis de Simulación
Cuatro gráficos comparativos entre días:

| # | Gráfico | Tipo |
|---|---------|------|
| 1 | **Top días con mayor bloqueo** de frenos | Barras apiladas por línea |
| 2 | **Top días con mayor ocupación** de servidores | Barras simples |
| 3 | **Vehículos atendidos por jornada** (autos + camionetas) | Área temporal |
| 4 | **Top días con hora de cierre más tardía** | Barras (eje Y en HH:MM) |

> Todos los gráficos se adaptan dinámicamente a cualquier cantidad de líneas configuradas.
> Para simulaciones con más de 60 días se activa el **modo agrupado** (semanas, meses, etc.) para mantener la legibilidad.

## Instalación y Uso

```bash
# Instalar dependencias
pnpm install

# Iniciar servidor de desarrollo
pnpm dev
```

El frontend corre en `http://localhost:5173` y se conecta a la API en `http://localhost:8000`.

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
