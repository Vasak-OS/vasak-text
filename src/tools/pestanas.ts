/**
 * Las pestañas, como cuentas puras sobre una lista.
 *
 * Está escrito **genérico a propósito**. El pedido era reutilizar el sistema de
 * la terminal, y al ir a buscarlo apareció que ya está duplicado entre la
 * terminal y el gestor de archivos: `TabDraggableComponent` es idéntico en las
 * dos, y el tipo `Tab` tiene cuatro de sus ocho campos que no son de la terminal
 * —`type`, `paneWidth`, `filterQuery`— porque se copió del gestor y le
 * crecieron los propios encima.
 *
 * Copiarlo una tercera vez dejaba el problema tres veces más grande. Así que acá
 * el modelo no sabe qué hay en una pestaña: lleva `id`, `titulo`, `sucio` y un
 * `datos` opaco que cada aplicación define. Eso es lo que permite que esto se
 * mude a `@vasakgroup/vue-tabs` y que la terminal y el gestor lo consuman sin
 * que ninguno de los dos le imponga sus campos al otro.
 *
 * Todo lo de acá es una función pura sobre la lista: recibe el estado y devuelve
 * uno nuevo, sin tocar el que entró. Es lo que lo hace probable sin montar un
 * componente, y las decisiones que se equivocan calladas son justamente éstas
 * —cuál queda activa al cerrar, qué pasa al cerrar la última.
 */

/** Una pestaña. `D` es lo que la aplicación guarda adentro. */
export interface Pestana<D> {
	id: string;
	titulo: string;
	/** Con cambios sin guardar. El indicador y el aviso al cerrar salen de acá. */
	sucio: boolean;
	datos: D;
}

/** La lista y cuál está activa. */
export interface Pestanas<D> {
	lista: Pestana<D>[];
	/** El `id` de la activa, o `null` si no hay ninguna. */
	activa: string | null;
}

export function vacio<D>(): Pestanas<D> {
	return { lista: [], activa: null };
}

let contador = 0;

/**
 * Un identificador nuevo.
 *
 * Un contador y no la ruta del archivo: dos pestañas pueden apuntar al mismo
 * archivo —se abre dos veces sin querer— y con la ruta como `id` la segunda
 * pisaría a la primera. Tampoco `Date.now()`, que repite si se abren varias en
 * el mismo milisegundo, que es exactamente lo que pasa al abrir una selección.
 */
export function nuevoId(): string {
	contador += 1;
	return `p${contador}`;
}

/** Agrega una pestaña al final y la deja activa. */
export function abrir<D>(estado: Pestanas<D>, pestana: Pestana<D>): Pestanas<D> {
	return { lista: [...estado.lista, pestana], activa: pestana.id };
}

/**
 * La pestaña que apunta a estos datos, si ya está abierta.
 *
 * Sirve para que abrir un archivo que ya está abierto lleve a su pestaña en
 * lugar de abrir una segunda con el mismo contenido: dos vistas del mismo
 * archivo, cada una con sus cambios, y la que guarde segunda pisa a la otra.
 */
export function buscar<D>(estado: Pestanas<D>, coincide: (datos: D) => boolean): Pestana<D> | null {
	return estado.lista.find((p) => coincide(p.datos)) ?? null;
}

export function activar<D>(estado: Pestanas<D>, id: string): Pestanas<D> {
	// Un `id` que no está no cambia nada: activar algo inexistente dejaría la
	// aplicación sin nada seleccionado y sin forma de volver.
	if (!estado.lista.some((p) => p.id === id)) return estado;
	return { ...estado, activa: id };
}

export function activaDe<D>(estado: Pestanas<D>): Pestana<D> | null {
	return estado.lista.find((p) => p.id === estado.activa) ?? null;
}

/**
 * Cierra una pestaña y decide cuál queda activa.
 *
 * Si se cierra la activa pasa a la de la **derecha**, y si era la última de la
 * fila, a la de la izquierda. Es lo que hacen todos los editores y lo que la
 * mano espera: cerrar tres seguidas con el mismo clic recorre la fila en lugar
 * de saltar al principio.
 *
 * Cerrar una que no es la activa **no cambia** la activa, aunque se corra de
 * lugar. Ese es el que se rompe callado al indexar por posición.
 */
export function cerrar<D>(estado: Pestanas<D>, id: string): Pestanas<D> {
	const posicion = estado.lista.findIndex((p) => p.id === id);
	if (posicion === -1) return estado;

	const lista = estado.lista.filter((p) => p.id !== id);

	if (estado.activa !== id) {
		return { lista, activa: estado.activa };
	}

	if (lista.length === 0) {
		return { lista, activa: null };
	}

	const siguiente = lista[Math.min(posicion, lista.length - 1)];
	return { lista, activa: siguiente.id };
}

/** Moverse por la fila. Da la vuelta en los extremos. */
export function siguiente<D>(estado: Pestanas<D>): Pestanas<D> {
	return correr(estado, 1);
}

export function anterior<D>(estado: Pestanas<D>): Pestanas<D> {
	return correr(estado, -1);
}

function correr<D>(estado: Pestanas<D>, paso: number): Pestanas<D> {
	if (estado.lista.length === 0) return estado;

	const posicion = estado.lista.findIndex((p) => p.id === estado.activa);
	// Sin activa se entra por el principio o por el final según para dónde se
	// vaya, en lugar de no hacer nada.
	if (posicion === -1) {
		const entrada = paso > 0 ? 0 : estado.lista.length - 1;
		return { ...estado, activa: estado.lista[entrada].id };
	}

	// El módulo con corrección de signo: en JavaScript `-1 % 3` es `-1`.
	const largo = estado.lista.length;
	const destino = (((posicion + paso) % largo) + largo) % largo;
	return { ...estado, activa: estado.lista[destino].id };
}

/**
 * Reordenar arrastrando: la pestaña de `desde` va a la posición `hasta`.
 *
 * La activa se sigue por `id` y no por posición, así que arrastrar no cambia
 * cuál está seleccionada.
 */
export function mover<D>(estado: Pestanas<D>, desde: number, hasta: number): Pestanas<D> {
	const largo = estado.lista.length;
	if (desde < 0 || desde >= largo || hasta < 0 || hasta >= largo || desde === hasta) {
		return estado;
	}

	const lista = [...estado.lista];
	const [movida] = lista.splice(desde, 1);
	lista.splice(hasta, 0, movida);
	return { ...estado, lista };
}

/** Reemplaza una pestaña por otra versión de sí misma. */
export function actualizar<D>(
	estado: Pestanas<D>,
	id: string,
	cambio: (pestana: Pestana<D>) => Pestana<D>
): Pestanas<D> {
	return {
		...estado,
		lista: estado.lista.map((p) => (p.id === id ? cambio(p) : p)),
	};
}

/** Cuántas tienen cambios sin guardar. El aviso al cerrar la ventana sale de acá. */
export function sucias<D>(estado: Pestanas<D>): Pestana<D>[] {
	return estado.lista.filter((p) => p.sucio);
}

// ── Los títulos ─────────────────────────────────────────────────────────────

/**
 * Los títulos de la fila, desambiguados cuando dos archivos se llaman igual.
 *
 * Abrir el `mod.rs` de dos módulos daba dos pestañas que decían `mod.rs`, y no
 * había forma de saber cuál era cuál más que probando. Acá, cuando un nombre se
 * repite, se le agrega el directorio que las distingue: `red/mod.rs` y
 * `disco/mod.rs`.
 *
 * Y se agrega **todo lo que haga falta**, no un nivel: `/proyecto/a/mod.rs` y
 * `/otro/a/mod.rs` comparten también el directorio padre, así que con un solo
 * nivel las dos seguían diciendo `a/mod.rs` y el problema quedaba igual. Se
 * suben niveles hasta que dejan de coincidir.
 *
 * Se alarga **sólo lo que se repite**: hacerlo siempre llenaría la fila de rutas
 * largas para resolver un problema que casi nunca está.
 *
 * Las pestañas sin archivo se quedan con el nombre que traen, porque no hay ruta
 * con la que desambiguarlas.
 */
export function titulos(rutas: (string | null)[]): string[] {
	const salida = rutas.map((ruta) => (ruta === null ? '' : nombreDe(ruta)));

	// Se sube un nivel por vuelta, y sólo en las posiciones que todavía chocan
	// con otra. El tope es la ruta más profunda: llegado ahí, dos títulos que
	// sigan iguales son la misma ruta escrita dos veces, y alargarlos más no
	// cambiaría nada.
	const profundidadMaxima = Math.max(
		1,
		...rutas.map((ruta) => (ruta === null ? 1 : segmentos(ruta).length))
	);

	for (let niveles = 2; niveles <= profundidadMaxima; niveles += 1) {
		const repetidos = new Set(
			salida.filter((titulo, i) => titulo !== '' && salida.indexOf(titulo) !== i)
		);
		if (repetidos.size === 0) break;

		for (const [i, ruta] of rutas.entries()) {
			if (ruta === null || !repetidos.has(salida[i])) continue;
			salida[i] = ultimosSegmentos(ruta, niveles);
		}
	}

	return salida;
}

function segmentos(ruta: string): string[] {
	return ruta.split('/').filter((p) => p.length > 0);
}

function nombreDe(ruta: string): string {
	const partes = segmentos(ruta);
	return partes[partes.length - 1] ?? ruta;
}

/** Los últimos `cuantos` segmentos de una ruta, o la ruta si tiene menos. */
function ultimosSegmentos(ruta: string, cuantos: number): string {
	const partes = segmentos(ruta);
	return partes.slice(Math.max(0, partes.length - cuantos)).join('/');
}
