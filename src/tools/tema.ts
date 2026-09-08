/**
 * El aspecto del editor, tomado del escritorio.
 *
 * No hay ningún color escrito acá: todo son las variables CSS de VasakOS. Eso
 * tiene dos consecuencias que valen el trabajo:
 *
 *  - **El modo oscuro sale gratis.** Las variables `--use-*` ya conmutan con la
 *    clase `.dark`, así que el editor cambia con el resto de la aplicación sin
 *    que haya que armar dos temas ni escuchar ningún evento.
 *  - **El editor usa los colores de la terminal.** Quien cambie la paleta del
 *    escritorio cambia las dos cosas a la vez. Es lo mismo que se acaba de hacer
 *    con las fuentes: la monoespaciada sale de `vasak.conf` → `fonts.terminal`
 *    por `--vsk-font-terminal`, así que el editor se ve como la terminal **por
 *    construcción** y no por coincidencia.
 */

import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

const apariencia = EditorView.theme({
	'&': {
		backgroundColor: 'transparent',
		color: 'var(--use-text-main)',
		// La fuente y el cuerpo que se eligieron en Configuración.
		fontFamily: 'var(--vsk-font-terminal)',
		fontSize: '13px',
		height: '100%',
	},
	'.cm-scroller': {
		fontFamily: 'inherit',
		// Un interlineado algo mayor que el de la terminal: acá se lee texto en
		// párrafos, no líneas sueltas de salida.
		lineHeight: '1.5',
		overflow: 'auto',
	},
	'.cm-content': {
		caretColor: 'var(--use-terminal-cursor)',
	},
	'.cm-cursor, .cm-dropCursor': {
		borderLeftColor: 'var(--use-terminal-cursor)',
		borderLeftWidth: '2px',
	},
	// La selección va con `!important` porque CodeMirror declara la suya con
	// mayor especificidad desde su hoja base; sin esto queda el azul del motor,
	// que no es de ninguna de las dos paletas.
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'color-mix(in srgb, var(--use-primary) 35%, transparent) !important',
	},
	'.cm-gutters': {
		backgroundColor: 'transparent',
		color: 'var(--use-text-muted)',
		border: 'none',
		// Separado del texto sin una línea: una regla vertical a lo largo de
		// toda la ventana pesa más que el número que acompaña.
		paddingRight: '8px',
	},
	'.cm-activeLine': {
		backgroundColor: 'color-mix(in srgb, var(--use-ui-surface) 45%, transparent)',
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'transparent',
		color: 'var(--use-text-main)',
	},
	'.cm-selectionMatch': {
		backgroundColor: 'color-mix(in srgb, var(--use-secondary) 25%, transparent)',
	},
	'.cm-searchMatch': {
		backgroundColor: 'color-mix(in srgb, var(--use-status-warning) 40%, transparent)',
		outline: '1px solid var(--use-status-warning)',
	},
	'.cm-searchMatch.cm-searchMatch-selected': {
		backgroundColor: 'color-mix(in srgb, var(--use-status-warning) 70%, transparent)',
	},
	// El panel de buscar y reemplazar, que CodeMirror dibuja con su propio
	// aspecto y desentona con la ventana si no se lo trae.
	'.cm-panels': {
		backgroundColor: 'var(--use-ui-surface)',
		color: 'var(--use-text-main)',
		fontFamily: 'var(--vsk-font-apps)',
		borderTop: '1px solid var(--use-ui-border)',
	},
	'.cm-panels input, .cm-panels button': {
		backgroundColor: 'var(--use-ui-background)',
		color: 'var(--use-text-main)',
		border: '1px solid var(--use-ui-border-strong)',
		borderRadius: 'var(--radius-corner-sm, 4px)',
		padding: '2px 6px',
	},
	'.cm-panels button': {
		cursor: 'pointer',
	},
	'.cm-tooltip': {
		backgroundColor: 'var(--use-ui-surface)',
		color: 'var(--use-text-main)',
		border: '1px solid var(--use-ui-border-strong)',
		borderRadius: 'var(--radius-corner-sm, 4px)',
	},
	// La marca de fin de documento y el relleno de abajo: sin esto la última
	// línea queda pegada al borde de la ventana y no se puede leer cómoda.
	'.cm-content, .cm-gutters': {
		paddingBottom: '30vh',
	},
});

/**
 * Qué color lleva cada cosa.
 *
 * Los `tags` son los de Lezer, que es el analizador de CodeMirror: cada lenguaje
 * marca sus piezas con estas etiquetas, así que un solo mapa alcanza para los
 * quince lenguajes en lugar de uno por lenguaje.
 */
const resaltado = HighlightStyle.define([
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment],
		color: 'var(--use-text-muted)',
		fontStyle: 'italic',
	},
	{ tag: [tags.keyword, tags.modifier, tags.controlKeyword], color: 'var(--use-terminal-magenta)' },
	{
		tag: [tags.string, tags.special(tags.string), tags.regexp],
		color: 'var(--use-terminal-green)',
	},
	{ tag: [tags.number, tags.bool, tags.null, tags.atom], color: 'var(--use-terminal-yellow)' },
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
		color: 'var(--use-terminal-blue)',
	},
	{ tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--use-terminal-cyan)' },
	{ tag: [tags.propertyName, tags.attributeName], color: 'var(--use-terminal-blue)' },
	{ tag: [tags.tagName], color: 'var(--use-terminal-magenta)' },
	{ tag: [tags.operator, tags.punctuation, tags.bracket], color: 'var(--use-text-muted)' },
	{ tag: [tags.variableName, tags.definition(tags.variableName)], color: 'var(--use-text-main)' },
	{ tag: [tags.invalid], color: 'var(--use-status-error)' },
	// Markdown, que es de lo que más se abre: los títulos y el énfasis se ven
	// como se leen.
	{ tag: [tags.heading], color: 'var(--use-primary)', fontWeight: 'bold' },
	{ tag: [tags.emphasis], fontStyle: 'italic' },
	{ tag: [tags.strong], fontWeight: 'bold' },
	{ tag: [tags.link, tags.url], color: 'var(--use-terminal-cyan)', textDecoration: 'underline' },
	{ tag: [tags.strikethrough], textDecoration: 'line-through' },
	// Los diff, para poder leer un parche.
	{ tag: [tags.inserted], color: 'var(--use-status-success)' },
	{ tag: [tags.deleted], color: 'var(--use-status-error)' },
	{ tag: [tags.changed], color: 'var(--use-status-warning)' },
]);

export const tema: Extension = [apariencia, syntaxHighlighting(resaltado)];
