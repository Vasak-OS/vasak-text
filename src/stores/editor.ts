/**
 * El estado del editor: qué archivos están abiertos y en qué condición.
 *
 * Lo que **no** está acá es el texto que se está escribiendo. Vive en CodeMirror,
 * que es su dueño, y llega a este almacén sólo cuando hay que guardarlo. Tenerlo
 * duplicado obligaría a copiar el documento entero en cada tecla y a decidir
 * cuál de las dos copias es la verdadera —y esa decisión se resuelve mal tarde o
 * temprano.
 *
 * De cada archivo se guarda, en cambio, **cómo estaba en disco**: su texto
 * guardado, su fin de línea, su huella. Es con eso que se sabe si hay cambios
 * sin guardar y que al guardar se lo devuelve como estaba.
 */

import { open as abrirDialogo, save as guardarDialogo } from '@tauri-apps/plugin-dialog';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
	abrirDocumento,
	type ErrorAlAbrir,
	type ErrorAlGuardar,
	esErrorConocido,
	type FinDeLinea,
	guardarDocumento,
	type Huella,
} from '@/tools/documento';
import type { Pestana, Pestanas } from '@/tools/pestanas';
import * as p from '@/tools/pestanas';

/** Lo que el editor guarda de cada pestaña. Es el `datos` opaco de `Pestana`. */
export interface Archivo {
	/** `null` en una pestaña nueva, que todavía no tiene archivo. */
	ruta: string | null;
	finDeLinea: FinDeLinea;
	terminaConSalto: boolean;
	/** `null` si nunca se leyó de disco: una pestaña nueva. */
	huella: Huella | null;
	/** Si el archivo traía marca de orden de bytes. Se devuelve al guardar. */
	bom: boolean;
	soloLectura: boolean;
	/** El texto tal como está en disco. Con esto se sabe si hay cambios. */
	guardado: string;
	/**
	 * Sube cuando el contenido se reemplaza desde afuera —abrir, recargar—.
	 *
	 * Es la señal para que el editor rearme su estado. Sin esto, recargar un
	 * archivo cambiaba `guardado` y la pantalla seguía mostrando lo anterior,
	 * que es la peor combinación: dice «guardado» y muestra otra cosa.
	 */
	generacion: number;
}

/** Algo que hay que decirle a quien está usando el editor. */
export type Aviso =
	| { tipo: 'no-se-pudo-abrir'; ruta: string; causa: ErrorAlAbrir }
	| { tipo: 'no-se-pudo-guardar'; ruta: string; causa: ErrorAlGuardar }
	| { tipo: 'cambio-en-disco'; id: string; ruta: string }
	| { tipo: 'ya-abierto'; ruta: string }
	| { tipo: 'guardado'; ruta: string };

export const useEditorStore = defineStore('editor', () => {
	const pestanas = ref<Pestanas<Archivo>>(p.vacio<Archivo>());
	/** El último aviso, que la interfaz traduce y muestra. */
	const aviso = ref<Aviso | null>(null);

	const lista = computed(() => pestanas.value.lista);
	const activa = computed(() => p.activaDe(pestanas.value));
	const hayCambiosSinGuardar = computed(() => p.sucias(pestanas.value).length > 0);

	/**
	 * Los títulos de la fila, desambiguados cuando dos archivos se llaman igual.
	 *
	 * Se calcula sobre la lista entera y no pestaña por pestaña, porque para
	 * saber si `mod.rs` necesita su directorio hay que mirar a las demás.
	 */
	const titulos = computed(() => p.titulos(lista.value.map((t) => t.datos.ruta)));

	function avisar(nuevo: Aviso) {
		aviso.value = nuevo;
	}

	function limpiarAviso() {
		aviso.value = null;
	}

	function nueva(): string {
		const pestana: Pestana<Archivo> = {
			id: p.nuevoId(),
			titulo: '',
			sucio: false,
			datos: {
				ruta: null,
				finDeLinea: 'lf',
				// Una pestaña nueva termina con salto al guardarla: es lo que
				// espera cualquier herramienta de línea de órdenes de un archivo
				// de texto, y POSIX lo pide.
				terminaConSalto: true,
				huella: null,
				// Un archivo nuevo no nace con marca de orden de bytes: casi
				// nada en este sistema la espera, y agregarla sería inventar
				// tres bytes que nadie pidió.
				bom: false,
				soloLectura: false,
				guardado: '',
				generacion: 0,
			},
		};

		pestanas.value = p.abrir(pestanas.value, pestana);
		return pestana.id;
	}

	/**
	 * Abre un archivo, o va a su pestaña si ya está abierto.
	 *
	 * Lo segundo importa: dos pestañas sobre el mismo archivo son dos versiones
	 * del mismo texto, cada una con sus cambios, y la que se guarde segunda pisa
	 * a la otra sin que nada avise.
	 */
	async function abrir(ruta: string): Promise<void> {
		const abierta = p.buscar(pestanas.value, (d) => d.ruta === ruta);
		if (abierta !== null) {
			pestanas.value = p.activar(pestanas.value, abierta.id);
			return;
		}

		try {
			const doc = await abrirDocumento(ruta);
			const pestana: Pestana<Archivo> = {
				id: p.nuevoId(),
				titulo: '',
				sucio: false,
				datos: {
					ruta: doc.ruta,
					finDeLinea: doc.finDeLinea,
					terminaConSalto: doc.terminaConSalto,
					huella: doc.huella,
					bom: doc.bom,
					soloLectura: doc.soloLectura,
					guardado: doc.texto,
					generacion: 1,
				},
			};
			pestanas.value = p.abrir(pestanas.value, pestana);
		} catch (error) {
			avisar({
				tipo: 'no-se-pudo-abrir',
				ruta,
				causa: esErrorConocido<ErrorAlAbrir>(error)
					? error
					: { clase: 'sistema', detalle: String(error) },
			});
		}
	}

	/** Abre el selector del sistema y abre lo que se elija. */
	async function abrirConDialogo(): Promise<void> {
		const elegido = await abrirDialogo({ multiple: true });
		if (elegido === null) return;

		for (const ruta of Array.isArray(elegido) ? elegido : [elegido]) {
			await abrir(ruta);
		}
	}

	function cerrar(id: string) {
		pestanas.value = p.cerrar(pestanas.value, id);
		// La aplicación no se queda sin ninguna: una ventana con la fila de
		// pestañas vacía y nada abajo no ofrece por dónde seguir.
		if (pestanas.value.lista.length === 0) nueva();
	}

	function activar(id: string) {
		pestanas.value = p.activar(pestanas.value, id);
	}

	function mover(desde: number, hasta: number) {
		pestanas.value = p.mover(pestanas.value, desde, hasta);
	}

	function siguiente() {
		pestanas.value = p.siguiente(pestanas.value);
	}

	function anterior() {
		pestanas.value = p.anterior(pestanas.value);
	}

	/** Marca si una pestaña tiene cambios sin guardar. Lo llama el editor. */
	function marcarSucio(id: string, sucio: boolean) {
		pestanas.value = p.actualizar(pestanas.value, id, (t) =>
			t.sucio === sucio ? t : { ...t, sucio }
		);
	}

	function cambiarDatos(id: string, cambio: (datos: Archivo) => Archivo) {
		pestanas.value = p.actualizar(pestanas.value, id, (t) => ({
			...t,
			datos: cambio(t.datos),
		}));
	}

	/**
	 * Guarda una pestaña. Sin ruta —una pestaña nueva— pregunta dónde.
	 *
	 * Devuelve si se guardó, para que quien lo pidió como paso previo a cerrar
	 * sepa si puede seguir.
	 */
	async function guardar(id: string, texto: string, terminaConSalto?: boolean): Promise<boolean> {
		const pestana = lista.value.find((t) => t.id === id);
		if (pestana === undefined) return false;

		if (pestana.datos.ruta === null) {
			return await guardarComo(id, texto, terminaConSalto);
		}

		return await escribir(id, pestana.datos.ruta, texto, pestana.datos.huella, terminaConSalto);
	}

	/** Pregunta dónde y guarda ahí. La pestaña pasa a ser de ese archivo. */
	async function guardarComo(
		id: string,
		texto: string,
		terminaConSalto?: boolean
	): Promise<boolean> {
		const pestana = lista.value.find((t) => t.id === id);
		if (pestana === undefined) return false;

		const destino = await guardarDialogo({
			defaultPath: pestana.datos.ruta ?? undefined,
		});
		if (destino === null) return false;

		// Otra pestaña sobre el mismo archivo son dos versiones del mismo texto,
		// y la que se guarde segunda pisa a la otra sin que nada avise. `abrir`
		// evita exactamente eso; sin este guard, «guardar como» sobre un archivo
		// ya abierto llegaba al estado que `abrir` no deja llegar — y encima la
		// comprobación de huella no lo detecta, porque cada pestaña guarda la
		// huella de su propia última escritura.
		const otra = p.buscar(pestanas.value, (d) => d.ruta === destino);
		if (otra !== null && otra.id !== id) {
			avisar({ tipo: 'ya-abierto', ruta: destino });
			return false;
		}

		// Sin huella: es otro archivo, y no hay nada con qué comparar. El
		// diálogo del sistema ya preguntó si había que pisarlo.
		return await escribir(id, destino, texto, null, terminaConSalto);
	}

	/**
	 * `terminaConSalto` puede venir dado: es la opción de «terminar el archivo
	 * con un salto», que se decide al guardar y no al abrir. Sin el parámetro se
	 * usa el del archivo, que es lo que conserva lo que tenía.
	 */
	async function escribir(
		id: string,
		ruta: string,
		texto: string,
		huella: Huella | null,
		terminaConSalto?: boolean
	): Promise<boolean> {
		const pestana = lista.value.find((t) => t.id === id);
		if (pestana === undefined) return false;

		const salto = terminaConSalto ?? pestana.datos.terminaConSalto;

		try {
			const nuevaHuella = await guardarDocumento(
				ruta,
				texto,
				pestana.datos.finDeLinea,
				salto,
				pestana.datos.bom,
				huella
			);

			cambiarDatos(id, (datos) => ({
				...datos,
				ruta,
				// El salto queda como se acaba de escribir: si no, la próxima vez
				// se compararía contra un archivo que ya no es así.
				terminaConSalto: salto,
				huella: nuevaHuella,
				guardado: texto,
				// Se acaba de escribir, así que se puede escribir.
				soloLectura: false,
			}));
			marcarSucio(id, false);
			avisar({ tipo: 'guardado', ruta });
			return true;
		} catch (error) {
			const causa: ErrorAlGuardar = esErrorConocido<ErrorAlGuardar>(error)
				? error
				: { clase: 'sistema', detalle: String(error) };

			// El cambio en disco no es una falla al escribir sino una decisión
			// que hay que ofrecer: recargar o guardar en otro lado. Por eso lleva
			// el `id`, que es lo que hace falta para poder actuar.
			if (causa.clase === 'cambio-en-disco') {
				avisar({ tipo: 'cambio-en-disco', id, ruta });
			} else {
				avisar({ tipo: 'no-se-pudo-guardar', ruta, causa });
			}
			return false;
		}
	}

	/**
	 * Vuelve a leer el archivo del disco, descartando lo que haya sin guardar.
	 *
	 * Es la salida del aviso de «cambió en disco». Sube `generacion` para que el
	 * editor rearme su estado con el contenido nuevo.
	 */
	async function recargar(id: string): Promise<void> {
		const pestana = lista.value.find((t) => t.id === id);
		if (pestana === undefined || pestana.datos.ruta === null) return;

		try {
			const doc = await abrirDocumento(pestana.datos.ruta);
			cambiarDatos(id, (datos) => ({
				...datos,
				finDeLinea: doc.finDeLinea,
				terminaConSalto: doc.terminaConSalto,
				huella: doc.huella,
				bom: doc.bom,
				soloLectura: doc.soloLectura,
				guardado: doc.texto,
				generacion: datos.generacion + 1,
			}));
			marcarSucio(id, false);
			limpiarAviso();
		} catch (error) {
			avisar({
				tipo: 'no-se-pudo-abrir',
				ruta: pestana.datos.ruta,
				causa: esErrorConocido<ErrorAlAbrir>(error)
					? error
					: { clase: 'sistema', detalle: String(error) },
			});
		}
	}

	return {
		pestanas,
		lista,
		activa,
		titulos,
		aviso,
		hayCambiosSinGuardar,
		nueva,
		abrir,
		abrirConDialogo,
		cerrar,
		activar,
		mover,
		siguiente,
		anterior,
		marcarSucio,
		guardar,
		guardarComo,
		recargar,
		limpiarAviso,
	};
});
