//! Los comandos que el editor puede pedirle al sistema.
//!
//! Son la **única** puerta entre el WebView y el disco. No está `tauri-plugin-fs`
//! a propósito: ese plugin necesita un `scope`, y el `scope` que hace falta para
//! un editor de texto es «todo el home». El de `vasak-desktop` ya quedó anotado
//! como superficie de más en el relevamiento; acá sería la versión grande del
//! mismo problema, porque cualquier cosa que llegue a ejecutarse en el WebView
//! —una página con la CSP mal puesta, un paquete de npm comprometido— heredaría
//! ese permiso.
//!
//! Con esto, en cambio, lo que el WebView puede hacer es exactamente: leer un
//! archivo que se le nombra, escribir un archivo que se le nombra, y preguntar
//! si existe. El selector de archivos lo abre el plugin de diálogos, que corre
//! del lado de Rust y devuelve la ruta elegida.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::documento::{self, Documento, ErrorAlAbrir, ErrorAlGuardar, FinDeLinea, Huella};

/// Las rutas que llegaron y todavía no recogió nadie.
///
/// Existe por una carrera estrecha pero real: el aviso de la segunda instancia
/// se emite a la ventana, y un evento emitido **antes** de que el frontend
/// registre su `listen` no se entrega a nadie. Si alguien abre dos archivos
/// seguidos desde el gestor de archivos, el segundo puede llegar mientras el
/// WebView todavía está arrancando, y esas rutas se perdían sin ningún aviso.
///
/// Así que además de emitirlas se guardan acá, y `rutas_de_apertura` las
/// entrega junto con las de la línea de órdenes. Que se entreguen dos veces no
/// molesta: `abrir` en el almacén va a la pestaña que ya tiene ese archivo en
/// lugar de abrir una segunda.
#[derive(Default)]
pub struct RutasPendientes(Mutex<Vec<String>>);

impl RutasPendientes {
    pub fn agregar(&self, rutas: Vec<String>) {
        // Un `Mutex` envenenado no puede dejar la aplicación sin abrir archivos:
        // lo peor que hay adentro es una lista de rutas.
        if let Ok(mut guardadas) = self.0.lock() {
            guardadas.extend(rutas);
        }
    }

    fn recoger(&self) -> Vec<String> {
        self.0
            .lock()
            .map(|mut guardadas| std::mem::take(&mut *guardadas))
            .unwrap_or_default()
    }
}

/// Abre un archivo.
#[tauri::command]
pub fn abrir_documento(ruta: String) -> Result<Documento, ErrorAlAbrir> {
    documento::abrir(Path::new(&ruta))
}

/// Guarda un archivo, conservando lo que tenía.
///
/// `huella` es la que devolvió `abrir_documento` (o el guardado anterior). Va en
/// `Option` porque «guardar como» sobre un archivo que este editor no abrió no
/// tiene con qué comparar.
#[tauri::command]
pub fn guardar_documento(
    ruta: String,
    texto: String,
    fin_de_linea: FinDeLinea,
    termina_con_salto: bool,
    bom: bool,
    huella: Option<Huella>,
) -> Result<Huella, ErrorAlGuardar> {
    documento::guardar(
        Path::new(&ruta),
        &texto,
        fin_de_linea,
        termina_con_salto,
        bom,
        huella,
    )
}

/// Si ya hay algo en esa ruta.
///
/// Para que «guardar como» pueda preguntar antes de pisar. El diálogo del
/// sistema ya suele preguntar, pero no cuando la ruta la escribe la aplicación.
#[tauri::command]
pub fn existe(ruta: String) -> bool {
    Path::new(&ruta).exists()
}

/// Las rutas que hay para abrir: las de la línea de órdenes y las que quedaron
/// esperando.
///
/// Es lo que hace que `vasak-text notas.md` —y el «abrir con» del gestor de
/// archivos, que termina siendo lo mismo— abra el archivo en lugar de una
/// ventana vacía. Ver [`RutasPendientes`] para las que llegan de una segunda
/// instancia mientras esto todavía arranca.
#[tauri::command]
pub fn rutas_de_apertura(pendientes: tauri::State<'_, RutasPendientes>) -> Vec<String> {
    let mut rutas = rutas_de(std::env::args().skip(1));
    rutas.extend(pendientes.recoger());
    rutas
}

/// Separa las rutas de lo que no lo es.
///
/// Aparte para poder probarla: `std::env::args()` no se puede sustituir en un
/// test.
///
/// Se descartan las opciones —lo que empieza con `-`— y **los argumentos que
/// mete el motor**: al correr bajo `cargo tauri dev` y en algunos arranques,
/// WebKitGTK y Tauri agregan los suyos. Sin filtrarlos, el editor abría pestañas
/// llamadas `--no-sandbox` en cada arranque de desarrollo.
pub fn rutas_de<I: IntoIterator<Item = String>>(argumentos: I) -> Vec<String> {
    argumentos
        .into_iter()
        .filter(|a| !a.starts_with('-'))
        .map(|a| absoluta(&a))
        .collect()
}

/// Vuelve absoluta una ruta relativa contra el directorio actual.
///
/// Hace falta porque el editor puede recibir `notas.md` desde una terminal, y
/// para el resto del programa —comparar si un archivo ya está abierto, mostrar
/// el directorio en el título— una ruta relativa depende de un directorio de
/// trabajo que la ventana no comparte.
///
/// No se canonicaliza: `canonicalize` falla si el archivo no existe, y `editor
/// archivo-nuevo.txt` tiene que poder abrir una pestaña para crearlo.
fn absoluta(ruta: &str) -> String {
    let camino = PathBuf::from(ruta);
    if camino.is_absolute() {
        return ruta.to_string();
    }

    std::env::current_dir()
        .map(|dir| dir.join(&camino).to_string_lossy().into_owned())
        .unwrap_or_else(|_| ruta.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn las_opciones_no_son_archivos() {
        // El síntoma sin esto: pestañas llamadas «--no-sandbox» en cada arranque
        // de desarrollo, porque el motor agrega sus propios argumentos.
        let rutas = rutas_de(vec![
            "--no-sandbox".to_string(),
            "/tmp/uno.txt".to_string(),
            "-v".to_string(),
        ]);

        assert_eq!(rutas, vec!["/tmp/uno.txt".to_string()]);
    }

    #[test]
    fn sin_argumentos_no_hay_nada_que_abrir() {
        assert!(rutas_de(Vec::<String>::new()).is_empty());
    }

    #[test]
    fn una_ruta_relativa_se_vuelve_absoluta() {
        // Llega desde una terminal, y el resto del programa compara rutas para
        // saber si un archivo ya está abierto.
        let rutas = rutas_de(vec!["notas.md".to_string()]);

        assert_eq!(rutas.len(), 1);
        assert!(rutas[0].starts_with('/'), "quedó relativa: {}", rutas[0]);
        assert!(rutas[0].ends_with("/notas.md"));
    }

    #[test]
    fn una_ruta_absoluta_se_deja_como_esta() {
        assert_eq!(
            rutas_de(vec!["/etc/hosts".to_string()]),
            vec!["/etc/hosts".to_string()]
        );
    }

    #[test]
    fn un_archivo_que_todavia_no_existe_se_acepta() {
        // `editor nuevo.txt` tiene que abrir una pestaña para crearlo. Por eso
        // no se canonicaliza: `canonicalize` falla si el archivo no está.
        let rutas = rutas_de(vec!["/tmp/no-existe-todavia-vasak.txt".to_string()]);
        assert_eq!(rutas, vec!["/tmp/no-existe-todavia-vasak.txt".to_string()]);
    }
}
