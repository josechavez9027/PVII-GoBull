# GoBull - Sistema visual

## 1. Proposito

Este documento define la identidad visual compartida de GoBull. Su objetivo es que las pantallas de autenticacion, operaciones, reportes, noticias e indicadores se sientan parte del mismo producto.

El sistema debe transmitir precision, control y lectura rapida de informacion financiera sin parecer una plataforma de trading saturada.

## 2. Direccion visual

- Interfaz de escritorio con densidad informativa controlada.
- Fondo blanco y canvas gris muy claro para maximizar la lectura de reportes.
- Sidebar azul para la navegación y superficies blancas para contenido y formularios.
- Los colores de estado se aplican como bordes sobre fondos blancos; el relleno aparece en hover o foco y el texto cambia a blanco.
- Verde reservado para resultados positivos y acciones principales.
- Rojo coral reservado para perdidas, errores y acciones destructivas.
- Azul claro para enlaces, foco y estados informativos.
- Bordes finos y radios moderados; evitar tarjetas excesivamente redondeadas.
- Graficos y cifras con jerarquia clara, no decorativa.

La interfaz no debe usar colores positivos o negativos como unico indicador. Siempre debe acompanarlos con texto, iconos o etiquetas.

## 3. Tipografia

### Familia principal

**Inter** para texto general, etiquetas y botones; **Inter Tight** para titulares y marca.

### Familia texto general

Se conserva la pila sans-serif definida en la aplicación: `Inter`, seguida de la pila de sistema.

### Familia numerica

Las cifras financieras pueden usar una familia monoespaciada cuando se incorpore el módulo de indicadores.

Las cifras financieras deben usar `font-variant-numeric: tabular-nums` para que las columnas no salten al actualizarse.

### Escala tipografica

| Token          | Tamano | Peso | Uso                                   |
| -------------- | ------ | ---- | ------------------------------------- |
| `text-display` | 32 px  | 500  | Encabezado principal de una vista     |
| `text-title`   | 24 px  | 700  | Titulos de panel                      |
| `text-heading` | 18 px  | 700  | Secciones y modales                   |
| `text-body`    | 14 px  | 400  | Texto general                         |
| `text-label`   | 12 px  | 700  | Etiquetas y metadatos                 |
| `text-caption` | 11 px  | 500  | Ayudas y estados secundarios          |
| `text-metric`  | 28 px  | 600  | Metricas destacadas                   |

En pantallas pequenas, `text-display` se reduce a 28 px y `text-title` a 20 px.

## 4. Paleta de colores

### Colores de marca y logotipo

El logotipo **GoBull** utiliza una composición tipográfica bitonal:
- **"Go"**: utiliza el azul primario de marca (`#087DC9` / `border-primary`).
- **"Bull"**: utiliza el verde distintivo (`#3AB576` / token `brand-bull`).

| Token        | Hex       | Uso                                                    |
| ------------ | --------- | ------------------------------------------------------ |
| `brand-go`   | `#087DC9` | Segmento "Go" del logotipo GoBull                      |
| `brand-bull` | `#3AB576` | Segmento "Bull" del logotipo GoBull (verde distintivo) |

### Colores base

| Token               | Hex       | Uso                        |
| ------------------- | --------- | -------------------------- |
| `bg-canvas`         | `#F5F7F9` | Fondo principal            |
| `bg-sidebar`        | `#0A91E8` | Navegacion lateral         |
| `bg-surface`        | `#FFFFFF` | Paneles y formularios      |
| `bg-surface-raised` | `#FAFDFF` | Filas y elementos hover    |
| `border-subtle`     | `#E3E9ED` | Bordes y separadores       |
| `text-primary`      | `#202C38` | Texto principal            |
| `text-secondary`    | `#576670` | Texto secundario           |
| `text-muted`        | `#71808C` | Texto auxiliar             |

### Colores de estado

| Token                         | Hex       | Uso                                       |
| ----------------------------- | --------- | ----------------------------------------- |
| `border-primary`              | `#087DC9` | Accion principal y tendencia positiva     |
| `border-accent-blue`          | `#159BD7` | Enlaces, foco y datos informativos        |
| `border-state-success`        | `#63A86B` | Confirmaciones y operaciones positivas    |
| `border-state-danger`         | `#D75B61` | Errores, perdidas y acciones destructivas |
| `border-state-warning`        | `#D99C26` | Alertas y datos pendientes                |
| `border-state-info`           | `#159BD7` | Informacion no critica                    |

### Reglas de contraste

- Texto principal sobre `bg-canvas` y `bg-surface`: minimo WCAG AA.
- Los colores de estado se usan como borde con fondo blanco por defecto; no crear botones solidos fuera de estados activos.
- Los estados deben incluir una etiqueta textual o icono adicional.
- El foco de teclado sera visible con un anillo de `2px` en `accent-blue`.

## 5. Espaciado y geometria

Usar una escala base de 4 px:

```text
space-1: 4px
space-2: 8px
space-3: 12px
space-4: 16px
space-5: 20px
space-6: 24px
space-8: 32px
space-10: 40px
space-12: 48px
```

Radios:

- `radius-sm`: 6 px para inputs y botones compactos.
- `radius-md`: 10 px para paneles y tarjetas.
- `radius-lg`: 14 px para modales o bloques destacados.
- Evitar radios tipo pastilla salvo para badges y filtros.

Sombras:

- Preferir bordes y diferencia de superficie.
- Usar sombra solo en modales y elementos flotantes.
- No usar sombras brillantes o efectos neon como decoracion general.

## 6. Componentes base

### Botones

- **Primario**: fondo blanco, borde y texto `border-primary`; en hover se rellena con `border-primary` y el texto pasa a blanco.
- **Secundario**: fondo blanco, borde `border-subtle`, texto `text-primary`; en hover se rellena con el color del borde y el texto pasa a blanco.
- **Peligro**: fondo blanco y borde `state-danger`; en hover se rellena con `state-danger` y el texto pasa a blanco.
- **Texto**: sin fondo ni borde; para acciones auxiliares.
- Todos los botones deben mostrar estado hover, focus, disabled y loading.

### Campos de formulario

- Fondo blanco (`bg-surface`).
- Borde `border-subtle`.
- Label siempre visible, no depender solo del placeholder.
- Focus con borde `accent-blue` y anillo visible.
- Error con `state-danger`, mensaje textual y asociacion accesible.
- Altura recomendada: 44 px para formularios principales.

### Paneles

- Fondo blanco (`bg-surface`).
- Borde de 1 px en `border-subtle`.
- Padding de 20 a 24 px.
- Titulo, descripcion opcional y contenido claramente separados.

### Badges

Usar badges para estados cortos como `Activo`, `Pendiente`, `Compra` y `Venta`. El color debe reforzar el texto, no reemplazarlo.

### Mensajes

- Exito: icono + texto en `state-success`.
- Error: icono + texto en `state-danger`.
- Advertencia: icono + texto en `state-warning`.
- Informacion: icono + texto en `state-info`.

## 7. Layout de aplicacion

En las vistas autenticadas se usara una estructura de dos zonas:

```text
┌───────────────┬───────────────────────────────────────┐
│ Sidebar       │ Header contextual                      │
│ navegacion    ├───────────────────────────────────────┤
│               │ Contenido principal                    │
│               │ paneles, tablas y graficos              │
└───────────────┴───────────────────────────────────────┘
```

- Sidebar de 248 px en escritorio.
- Contenido con ancho maximo de 1440 px y padding de 32 px.
- Header contextual con titulo de vista, fecha o contexto y acciones.
- En movil, el sidebar se convierte en navegacion tipo drawer.
- Las tablas deben permitir desplazamiento horizontal sin romper el layout.

## 8. Pantallas del Sprint 1

### Login y registro

- Layout dividido en escritorio: formulario a la izquierda y panel de identidad a la derecha.
- El panel de identidad puede mostrar una frase de producto y una visualizacion abstracta de datos, sin datos financieros ficticios que parezcan reales.
- En movil se oculta el panel secundario y el formulario ocupa todo el ancho.
- El foco principal debe estar en el formulario, no en ilustraciones.

### Recuperacion de contrasena

- Mantener la misma estructura y jerarquia que login.
- Explicar claramente que se enviara un enlace al correo.
- Despues del envio, mostrar confirmacion generica sin revelar si el correo existe.

### Dashboard protegido inicial

- Usar el layout autenticado con sidebar y header.
- Mostrar un estado vacio intencional que anticipe el modulo de operaciones.
- No simular metricas de trading en Sprint 1.

## 9. Responsive

Breakpoints de referencia:

| Nombre    | Ancho          | Comportamiento                                            |
| --------- | -------------- | --------------------------------------------------------- |
| `mobile`  | menor a 640 px | Una columna, sidebar drawer, formularios a ancho completo |
| `tablet`  | 640 a 1023 px  | Dos columnas solo cuando el contenido lo permita          |
| `desktop` | 1024 px o mas  | Sidebar fija y layout de paneles                          |
| `wide`    | 1440 px o mas  | Mayor espacio entre paneles, sin estirar lineas de texto  |

La funcionalidad debe mantenerse completa en movil, aunque GoBull este orientado principalmente a escritorio.

## 10. Iconografia y movimiento

- Usar una sola familia de iconos consistente.
- Los iconos deben tener etiqueta accesible cuando comuniquen una accion.
- Evitar iconos de colores arbitrarios.
- Transiciones de 150 a 200 ms para hover, focus y apertura de paneles.
- No usar animaciones continuas en la interfaz principal.
- Respetar `prefers-reduced-motion`.

## 11. Aplicacion tecnica futura

Los tokens visuales deben centralizarse en variables CSS o en la configuracion del sistema de estilos de Angular. Los componentes compartidos no deben definir colores hexadecimales directamente salvo en la capa de tokens.

La implementacion visual del Sprint 1 debe crear primero los elementos reutilizables de formulario, boton, mensaje, panel y layout. Los modulos futuros consumiran esos mismos elementos.

## 12. Fuera de alcance

- Diseno final de graficos de operaciones.
- Visualizaciones especificas de noticias o indicadores.
- Personalizacion de colores por usuario.
- Sistema avanzado de design tokens para multiples marcas.
