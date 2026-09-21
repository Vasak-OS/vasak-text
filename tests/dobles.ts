/**
 * Los dobles de lo que sólo existe adentro de la ventana de Tauri.
 *
 * Sin ellos, importar el layout falla en la primera línea: el marco pide
 * iconos, escucha el cambio de tema y lee la configuración del escritorio.
 */

export const laVentanaRecibio: string[] = [];

export function getCurrentWindow() {
	return {
		minimize: async () => void laVentanaRecibio.push('minimize'),
		toggleMaximize: async () => void laVentanaRecibio.push('toggleMaximize'),
		close: async () => void laVentanaRecibio.push('close'),
		destroy: async () => void laVentanaRecibio.push('destroy'),
		// El editor la usa para preguntar antes de cerrar con cambios sin
		// guardar. Sin esto, montarlo revienta en `onMounted`.
		onCloseRequested: async () => () => {},
	};
}

/** El `t()` devuelve la clave: una prueba que mire el texto mira la clave. */
export function useI18n() {
	return { t: (clave: string) => clave, locale: { value: 'es' } };
}

/** Lo que el marco lee para saber de qué lado va la barra. */
let configuracion: Record<string, unknown> = {};

export function ponerLaConfiguracion(nueva: Record<string, unknown>) {
	configuracion = nueva;
}

export async function readConfig() {
	return configuracion;
}

export function useConfigStore() {
	return { config: configuracion, loadConfig: async () => {} };
}

/** Lo que contesta el backend, por comando. */
const respuestas = new Map<string, unknown>([
	// Con qué archivos se abrió la aplicación. Sin doblarlo devuelve
	// `undefined`, y el `for…of` que lo recorre revienta en `onMounted`: la
	// prueba sigue pasando, pero con un error escupido en cada montaje.
	['rutas_de_apertura', [] as string[]],
]);

export function contestar(comando: string, valor: unknown) {
	respuestas.set(comando, valor);
}

export async function invoke(comando: string) {
	return respuestas.get(comando);
}

export async function listen(_nombre: string, _manejador: () => unknown) {
	return () => {};
}

/**
 * El tema resuelto, de mentira.
 *
 * Devolvían la cadena vacía, y con el `<img>` escrito a mano eso daba un `img`
 * igual —vacío, pero presente—. `ThemeIcon` no dibuja el `img` hasta tener
 * fuente: deja un hueco del mismo tamaño para que la fila no salte. Así que el
 * doble tiene que devolver algo, o lo que se comprueba es el hueco.
 */
export async function getIconSource(nombre: string) {
	return `icono:${nombre}`;
}

export async function getSymbolSource(nombre: string) {
	return `simbolo:${nombre}`;
}

export function olvidarTodo() {
	laVentanaRecibio.length = 0;
	respuestas.set('rutas_de_apertura', []);
	configuracion = {};
}
