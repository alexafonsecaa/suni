/* =====================================================
   ESP32 SUNI · v2
   Alarma semanal + lámpara de sueño + Bluetooth LE

   Integrado con la aplicación web Suni (réplica del
   diseño de Figma "Suni"): la página envía la hora y el
   día desde el navegador, el horario semanal del frame
   "Mis hábitos", el sonido y el volumen de "Configura tu
   Buddi", y enciende el botón Bluetooth cuando hay enlace.

   COMANDOS (por BLE o monitor serie 115200):

     SETTIME=HH:MM:SS              hora (desde el navegador)
     SETDAY=1..7                   día ISO: 1=Lun … 7=Dom
     SETALARM=d,HH:MM              alarma del día d
     SETALARM=HH:MM                alarma de los 7 días
     SETALARM=d,OFF                desactiva el día d
     SETSLEEP=d,HH:MM              hora pm (dormir) del día d
     SETSLEEP=HH:MM                los 7 días
     SETSLEEP=OFF                  desactiva la luz de sueño
     SETSOUND=clasico|pajaro|rio|digital
     SETVOLUME=0..100
     STATUS                        estado compacto
     STOP                          detiene la alarma
     TEST                          prueba de alarma

   REGLAS DE LA LUZ DE SUEÑO:
     · La hora "am" de cada día de "Mis hábitos" = alarma.
     · La hora "pm" de cada día = hora de dormir.
     · Los 60 minutos anteriores al pm: la lámpara se
       enciende 1 minuto de cada 5, con fundido suave.

   v2 · 2026-10-21
   ===================================================== */

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_arduino_version.h>
#include "sleep_routine.h"

// =====================================================
// TELEMETRÍA WIFI (OPCIONAL)
// La aplicación web no la necesita: la hora, el día y el
// horario llegan por BLE (SETTIME/SETDAY/SETALARM/…).
// Actívala solo si además quieres que la ESP32 publique
// su estado en un servidor local (npm start) cada 5 s.
// =====================================================

#define SUNI_TELEMETRIA_WIFI 0

// =====================================================
// PINES
// =====================================================

const int PIN_LDR     = 34;
const int PIN_BUZZER  = 25;
const int PIN_LAMPARA = 26;
const int LED_ROJO    = 27;
const int LED_VERDE   = 14;

// =====================================================
// CONFIGURACIÓN DEL LDR (teléfono sobre la cama)
// =====================================================

// Calibración provisional según mediciones: verde=4050, azul=4095,
// tapado=2300. El ADC está saturado; aislar el sensor y recalibrar.
// Umbral de ENCENDIDO >4080; APAGADO <4060.
const int UMBRAL_LUZ = 4070;
const int MARGEN_LUZ = 10;

// El teléfono debe permanecer DURACION_TELEFONO milisegundos
const unsigned long DURACION_TELEFONO = 30000;           // 30 segundos
const unsigned long SEGUNDOS_TELEFONO = DURACION_TELEFONO / 1000;

// La alarma suena al menos 10 segundos antes de poder
// apagarse por el teléfono
const unsigned long TIEMPO_MINIMO_ALARMA = 10000;

#if SUNI_TELEMETRIA_WIFI
#include <WiFi.h>
#include <HTTPClient.h>

// =====================================================
// WIFI (TELEMETRÍA OPCIONAL)
// La hora NO depende de la red: la envía la aplicación
// web por BLE (SETTIME/SETDAY).
// =====================================================

const char *WIFI_SSID = "TU_WIFI";
const char *WIFI_PASS = "TU_CONTRASENA";

// IP del computador con el servidor web (opcional)
const char *SERVER_URL = "http://192.168.1.100:3000";

const unsigned long INTERVALO_POST = 5000;
unsigned long ultimoPOST = 0;

bool wifiConfigurada() {
  return strcmp(WIFI_SSID, "TU_WIFI") != 0;
}
#endif

// =====================================================
// SONIDOS DE ALARMA
// =====================================================

const int SONIDO_CLASICO = 0;
const int SONIDO_PAJARO  = 1;
const int SONIDO_RIO     = 2;
const int SONIDO_DIGITAL = 3;

int sonidoAlarma = SONIDO_CLASICO;
int volumenAlarma = 100;   // 0 a 100

// Última frecuencia aplicada (para no reescribir el LEDC en bucle)
int ultimoTono = -1;

const char *nombreSonido() {
  switch (sonidoAlarma) {
    case SONIDO_PAJARO:  return "pajaro";
    case SONIDO_RIO:     return "rio";
    case SONIDO_DIGITAL: return "digital";
    default:             return "clasico";
  }
}

// =====================================================
// UUID DEL SERVICIO BLE
// =====================================================

#define SERVICE_UUID        "12345678-1234-1234-1234-1234567890ab"
#define CHARACTERISTIC_UUID "abcd1234-ab12-cd34-ef56-abcdef123456"

// =====================================================
// VARIABLES BLE
// =====================================================

BLEServer *pServer = nullptr;
BLECharacteristic *pCharacteristic = nullptr;

bool deviceConnected = false;

// Aviso "READY" pendiente de enviar al conectarse
// (notify desde el callback de conexión no es seguro)
bool pendienteReady = false;

// =====================================================
// RELOJ (sincronizado desde el navegador)
// =====================================================

int horaActual   = 0;
int minutoActual = 0;
int segundoActual = 0;

int diaActual = 1;   // ISO 8601: 1 = lunes … 7 = domingo

unsigned long ultimoSegundo = 0;

const char *DIAS[8] = {"", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"};
const char *DIAS_LARGO[8] = {"", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"};

// =====================================================
// HORARIO SEMANAL (índice 1..7 = lunes..domingo)
// am → hora de alarma · pm → hora de dormir
// =====================================================

int horaAlarma[8]   = {0, 8, 8, 8, 8, 8, 8, 8};
int minutoAlarma[8] = {0, 0, 0, 0, 0, 0, 0, 0};
bool alarmaDiaOn[8] = {false, true, true, true, true, true, true, true};

int horaDormir[8]   = {0, 23, 23, 23, 23, 23, 23, 23};
int minutoDormir[8] = {0, 0, 0, 0, 0, 0, 0, 0};
bool suenoDiaOn[8]  = {false, true, true, true, true, true, true, true};

// =====================================================
// ESTADO DE ALARMA
// =====================================================

bool alarmaSonando = false;
bool alarmaYaEjecutadaHoy = false;
unsigned long inicioAlarma = 0;

// =====================================================
// LÁMPARA CON FUNDIDO SUAVE (PWM)
// =====================================================

const int RESOLUCION_LUZ = 8;                 // 0..255
const unsigned long FADE_LUZ_MS = 1500;       // fundido completo

#if ESP_ARDUINO_VERSION_MAJOR < 3
const int CANAL_LUZ = 1;                      // el 0 lo usa el buzzer
#endif

int luzObjetivo = 0;                          // 0..255 deseado
int luzActual = 0;                            // 0..255 real (funda hacia ahí)
unsigned long ultimoPasoLuz = 0;

// ¿La lámpara está encendida por la ventana de sueño?
bool luzSuenoEncendida = false;

// ¿Estamos dentro de la hora previa al pm de algún día?
bool modoSuenoActivo = false;

// =====================================================
// LDR Y TEMPORIZADOR
// =====================================================

int valorLDR = 0;
bool celularDetectado = false;
bool estadoLuzAnterior = false;

bool temporizadorActivo = false;
unsigned long inicioTemporizador = 0;
unsigned long ultimoMensajeTemporizador = 0;

// =====================================================
// PROTOTIPOS
// =====================================================

void procesarComando(String comando);
void recibirSerial();
void detectarLuz();
void actualizarHora();
void controlarAlarma();
void controlarTemporizador();
void hacerSonidoAlarma();
void detenerAlarma();
void iniciarTemporizador();
void sonidoCelebracion();
void enviarBLE(String mensaje);
void configurarBuzzer();
void tono(int frecuencia);
void silencio();
void configurarLampara();
void lamparaEscribir(int duty);
void actualizarLampara();
int inicioVentanaDia(int d);
bool diaEnVentanaDia(int d);
int diaEnVentanaSueno();
void controlarLuz(int ventana);
void enviarEstadoAlServidor();
bool parsearHora(const String &texto, int &h, int &m);
void aplicarHorario(bool esAlarma, int dia, int h, int m, bool activo);
void procesarHorario(String args, bool esAlarma);
const char *nombreSonido();

// =====================================================
// BUZZER CON VOLUMEN (LEDC)
// Compatible con Arduino-ESP32 2.x y 3.x
// =====================================================

const int RESOLUCION_BUZZER = 10;

#if ESP_ARDUINO_VERSION_MAJOR < 3
const int CANAL_BUZZER = 0;
#endif

void configurarBuzzer() {

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_BUZZER, 2000, RESOLUCION_BUZZER);
#else
  ledcSetup(CANAL_BUZZER, 2000, RESOLUCION_BUZZER);
  ledcAttachPin(PIN_BUZZER, CANAL_BUZZER);
#endif
}

// Genera un tono respetando el volumen configurado (0 a 100)
void tono(int frecuencia) {

  // 50% del ciclo (511 de 1023) = volumen al máximo
  int duty = map(volumenAlarma, 0, 100, 0, 511);

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWriteTone(PIN_BUZZER, frecuencia);
  ledcWrite(PIN_BUZZER, duty);
#else
  ledcWriteTone(CANAL_BUZZER, frecuencia);
  ledcWrite(CANAL_BUZZER, duty);
#endif
}

void silencio() {

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_BUZZER, 0);
  ledcWriteTone(PIN_BUZZER, 0);
#else
  ledcWrite(CANAL_BUZZER, 0);
  ledcWriteTone(CANAL_BUZZER, 0);
#endif
}

// =====================================================
// LÁMPARA POR PWM (FUNDIDO)
// =====================================================

void configurarLampara() {

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(PIN_LAMPARA, 5000, RESOLUCION_LUZ);
#else
  ledcSetup(CANAL_LUZ, 5000, RESOLUCION_LUZ);
  ledcAttachPin(PIN_LAMPARA, CANAL_LUZ);
#endif

  luzObjetivo = 0;
  luzActual = 0;
  lamparaEscribir(0);
}

void lamparaEscribir(int duty) {

#if ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(PIN_LAMPARA, duty);
#else
  ledcWrite(CANAL_LUZ, duty);
#endif
}

// Funde luzActual hacia luzObjetivo (no bloqueante, ~20 ms por paso)
void actualizarLampara() {

  unsigned long ahora = millis();
  unsigned long dt = ahora - ultimoPasoLuz;

  if (dt < 20) {
    return;
  }

  ultimoPasoLuz = ahora;

  if (luzActual == luzObjetivo) {
    return;
  }

  int paso = (int)(255UL * dt / FADE_LUZ_MS);

  if (paso < 1) {
    paso = 1;
  }

  if (luzActual < luzObjetivo) {
    luzActual = min(luzObjetivo, luzActual + paso);
  }
  else {
    luzActual = max(luzObjetivo, luzActual - paso);
  }

  lamparaEscribir(luzActual);
}

// =====================================================
// CALLBACKS DEL SERVIDOR BLE
// =====================================================

class MyServerCallbacks : public BLEServerCallbacks {

  void onConnect(BLEServer *server) override {

    deviceConnected = true;
    pendienteReady = true;

    Serial.println();
    Serial.println("==============================");
    Serial.println("BLE: TELEFONO CONECTADO");
    Serial.println("==============================");
  }

  void onDisconnect(BLEServer *server) override {

    deviceConnected = false;
    pendienteReady = false;

    Serial.println();
    Serial.println("BLE: TELEFONO DESCONECTADO");
    Serial.println("BLE: Reiniciando advertising...");

    // Permitir que el teléfono vuelva a conectarse
    BLEDevice::startAdvertising();
  }
};

// =====================================================
// CALLBACK PARA RECIBIR COMANDOS BLE
// =====================================================

class MyCharacteristicCallbacks : public BLECharacteristicCallbacks {

  void onWrite(BLECharacteristic *characteristic) override {

    // getValue(): String en el core 2.x, std::string en el 3.x
    String value = String(characteristic->getValue().c_str());

    if (value.length() == 0) {
      return;
    }

    value.trim();

    Serial.print("BLE recibido: ");
    Serial.println(value);

    procesarComando(value);
  }
};

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(115200);

  Serial.println();
  Serial.println("========================================");
  Serial.println("     ESP32 SUNI v2 · ALARMA SEMANAL");
  Serial.println("========================================");

  // ---------------------------------------------------
  // CONFIGURAR PINES
  // ---------------------------------------------------

  pinMode(PIN_LDR, INPUT);
  pinMode(LED_ROJO, OUTPUT);
  pinMode(LED_VERDE, OUTPUT);

  // Estado inicial
  digitalWrite(LED_ROJO, HIGH);
  digitalWrite(LED_VERDE, LOW);

  // Buzzer y lámpara por LEDC
  configurarBuzzer();
  silencio();
  configurarLampara();

  // ---------------------------------------------------
  // WIFI (OPCIONAL · SOLO TELEMETRÍA)
  // ---------------------------------------------------

#if SUNI_TELEMETRIA_WIFI

  if (wifiConfigurada()) {

    Serial.println("Conectando a WiFi...");

    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASS);

    int intentos = 0;

    while (WiFi.status() != WL_CONNECTED && intentos < 40) {
      delay(250);
      Serial.print(".");
      intentos++;
    }

    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
      Serial.print("WiFi conectado. IP: ");
      Serial.println(WiFi.localIP());
    }
    else {
      Serial.println("Sin conexion WiFi. Se reintentara.");
    }
  }
  else {

    Serial.println("WiFi NO configurado (telemetria opcional).");
    Serial.println("La hora la fija la aplicacion web por BLE.");
  }

#else

  Serial.println("Telemetria WiFi desactivada (SUNI_TELEMETRIA_WIFI 0).");
  Serial.println("La hora la fija la aplicacion web por BLE.");

#endif

  // ---------------------------------------------------
  // INICIAR BLE
  // ---------------------------------------------------

  Serial.println("Iniciando Bluetooth Low Energy...");

  BLEDevice::init("ESP32_alarma_ble");

  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  // Descriptor necesario para NOTIFY
  pCharacteristic->addDescriptor(new BLE2902());

  pCharacteristic->setValue("ESP32_alarma_ble listo");

  pService->start();

  // ---------------------------------------------------
  // CONFIGURAR ADVERTISING
  // ---------------------------------------------------

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);

  // Ayuda con compatibilidad de algunos teléfonos
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  BLEDevice::startAdvertising();

  Serial.println();
  Serial.println("========================================");
  Serial.println("BLE INICIADO · Nombre: ESP32_alarma_ble");
  Serial.println("Esperando la aplicacion web...");
  Serial.println("========================================");

  Serial.println();
  Serial.println("Comandos disponibles:");
  Serial.println("SETTIME=07:25:00");
  Serial.println("SETDAY=1            (1=Lun ... 7=Dom)");
  Serial.println("SETALARM=1,07:30    (dia, hora am)");
  Serial.println("SETALARM=07:30      (todos los dias)");
  Serial.println("SETSLEEP=5,23:00    (dia, hora pm)");
  Serial.println("SETSLEEP=23:00      (todos los dias)");
  Serial.println("SETSOUND=clasico|pajaro|rio|digital");
  Serial.println("SETVOLUME=80");
  Serial.println("STATUS · STOP · TEST");
}

// =====================================================
// LOOP
// =====================================================

void loop() {

  actualizarHora();

  recibirSerial();

  detectarLuz();

  int ventana = diaEnVentanaSueno();
  modoSuenoActivo = ventana >= 0;

  enviarEstadoAlServidor();

  controlarAlarma();

  controlarTemporizador();

  controlarLuz(ventana);

  actualizarLampara();

  // READY pendiente tras la conexión BLE
  if (pendienteReady && deviceConnected) {
    pendienteReady = false;
    enviarBLE("READY");
  }

  delay(20);
}

// =====================================================
// RECIBIR COMANDOS POR SERIAL
// =====================================================

void recibirSerial() {

  if (Serial.available()) {

    String comando = Serial.readStringUntil('\n');

    comando.trim();

    if (comando.length() > 0) {

      Serial.print("Serial recibido: ");
      Serial.println(comando);

      procesarComando(comando);
    }
  }
}

// =====================================================
// UTILIDADES DE HORARIO
// =====================================================

bool parsearHora(const String &texto, int &h, int &m) {

  int sep = texto.indexOf(':');

  if (sep <= 0) {
    return false;
  }

  h = texto.substring(0, sep).toInt();
  m = texto.substring(sep + 1).toInt();

  return h >= 0 && h < 24 && m >= 0 && m < 60;
}

// Aplica un horario a un día (1..7) o a toda la semana (dia < 1)
void aplicarHorario(bool esAlarma, int dia, int h, int m, bool activo) {

  int desde = (dia < 1) ? 1 : dia;
  int hasta = (dia < 1) ? 7 : dia;

  for (int d = desde; d <= hasta; d++) {

    if (esAlarma) {

      bool cambio =
        horaAlarma[d] != h ||
        minutoAlarma[d] != m ||
        alarmaDiaOn[d] != activo;

      horaAlarma[d] = h;
      minutoAlarma[d] = m;
      alarmaDiaOn[d] = activo;

      // Si cambia la alarma de hoy, volver a armarse
      if (cambio && d == diaActual) {
        alarmaYaEjecutadaHoy = false;
      }
    }
    else {

      horaDormir[d] = h;
      minutoDormir[d] = m;
      suenoDiaOn[d] = activo;

      // La ventana se recalcula en cada ciclo del loop
      luzSuenoEncendida = false;
    }
  }
}

// SETALARM=… / SETSLEEP=… (acepta "d," inicial y OFF)
void procesarHorario(String args, bool esAlarma) {

  const char *prefijo = esAlarma ? "Alarma" : "Sueno";

  args.trim();

  int dia = -1;
  int coma = args.indexOf(',');

  if (coma > 0) {

    dia = args.substring(0, coma).toInt();
    args = args.substring(coma + 1);
    args.trim();

    if (dia < 1 || dia > 7) {
      enviarBLE("Dia invalido");
      return;
    }
  }

  args.toLowerCase();

  // ---------------------------------------------------
  // APAGAR
  // ---------------------------------------------------

  if (args == "off" || args == "apagar" || args == "-1") {

    aplicarHorario(esAlarma, dia, 0, 0, false);

    char texto[20];
    snprintf(texto, sizeof(texto), "%s off", prefijo);

    Serial.printf("%s desactivada%s.\n", prefijo,
                  dia < 1 ? " (toda la semana)" : "");

    enviarBLE(texto);
    return;
  }

  // ---------------------------------------------------
  // HORA HH:MM
  // ---------------------------------------------------

  int h = 0;
  int m = 0;

  if (!parsearHora(args, h, m)) {
    enviarBLE("Hora invalida");
    return;
  }

  aplicarHorario(esAlarma, dia, h, m, true);

  char texto[20];

  if (dia >= 1) {
    snprintf(texto, sizeof(texto), "%s %s %02d:%02d",
             prefijo, DIAS[dia], h, m);
    Serial.printf("%s %s: %02d:%02d\n", prefijo, DIAS_LARGO[dia], h, m);
  }
  else {
    snprintf(texto, sizeof(texto), "%s %02d:%02d", prefijo, h, m);
    Serial.printf("%s (toda la semana): %02d:%02d\n", prefijo, h, m);
  }

  enviarBLE(texto);
}

// =====================================================
// PROCESAR COMANDOS
// =====================================================

void procesarComando(String comando) {

  comando.trim();

  String c = comando;
  c.toLowerCase();

  // ===================================================
  // SETTIME=HH:MM:SS (hora enviada por el navegador)
  // ===================================================

  if (c.startsWith("settime=")) {

    String textoHora = comando.substring(8);

    int h = -1;
    int m = -1;
    int s = 0;

    int sep = textoHora.indexOf(':');

    if (sep > 0) {

      String resto = textoHora.substring(sep + 1);
      int sep2 = resto.indexOf(':');

      h = textoHora.substring(0, sep).toInt();
      m = (sep2 > 0 ? resto.substring(0, sep2) : resto).toInt();
      s = (sep2 > 0) ? resto.substring(sep2 + 1).toInt() : 0;

      if (h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60) {

        horaActual = h;
        minutoActual = m;
        segundoActual = s;
        ultimoSegundo = millis();

        Serial.printf("Hora configurada: %02d:%02d:%02d\n", h, m, s);

        enviarBLE("Hora configurada");
        return;
      }
    }

    Serial.println("Hora invalida.");
    enviarBLE("Hora invalida");
    return;
  }

  // ===================================================
  // SETDAY=1..7 (día ISO desde el navegador)
  // ===================================================

  if (c.startsWith("setday=")) {

    int d = comando.substring(7).toInt();

    if (d >= 1 && d <= 7) {

      diaActual = d;

      Serial.printf("Dia configurado: %s\n", DIAS_LARGO[d]);

      enviarBLE(String("Dia: ") + DIAS[d]);
    }
    else {

      enviarBLE("Dia invalido");
    }

    return;
  }

  // ===================================================
  // SETALARM=… (am de "Mis hábitos")
  // ===================================================

  if (c.startsWith("setalarm=")) {

    procesarHorario(comando.substring(9), true);
    return;
  }

  // ===================================================
  // SETSLEEP=… (pm de "Mis hábitos")
  // ===================================================

  if (c.startsWith("setsleep=")) {

    procesarHorario(comando.substring(9), false);
    return;
  }

  // ===================================================
  // SETSOUND=… (sonido elegido en "Configura tu Buddi")
  // ===================================================

  if (c.startsWith("setsound=")) {

    String sonido = comando.substring(9);

    sonido.trim();
    sonido.toLowerCase();

    int nuevoSonido = -1;

    if (sonido == "clasico" || sonido == "0") {
      nuevoSonido = SONIDO_CLASICO;
    }
    else if (sonido == "pajaro" || sonido == "1") {
      nuevoSonido = SONIDO_PAJARO;
    }
    else if (sonido == "rio" || sonido == "2") {
      nuevoSonido = SONIDO_RIO;
    }
    else if (sonido == "digital" || sonido == "3") {
      nuevoSonido = SONIDO_DIGITAL;
    }

    if (nuevoSonido >= 0) {

      sonidoAlarma = nuevoSonido;
      ultimoTono = -1;

      Serial.printf("Sonido de alarma: %s\n", nombreSonido());

      enviarBLE(String("Sonido: ") + nombreSonido());
    }
    else {

      enviarBLE("Sonido no valido");
    }

    return;
  }

  // ===================================================
  // SETVOLUME=0..100
  // ===================================================

  if (c.startsWith("setvolume=")) {

    String textoVolumen = comando.substring(10);

    textoVolumen.trim();

    bool soloDigitos =
      textoVolumen.length() > 0 &&
      textoVolumen.length() <= 3;

    for (unsigned int i = 0; i < textoVolumen.length(); i++) {
      if (!isDigit(textoVolumen.charAt(i))) {
        soloDigitos = false;
      }
    }

    if (soloDigitos) {

      int nuevoVolumen = textoVolumen.toInt();

      if (nuevoVolumen >= 0 && nuevoVolumen <= 100) {

        volumenAlarma = nuevoVolumen;
        ultimoTono = -1;

        Serial.printf("Volumen de alarma: %d%%\n", volumenAlarma);

        enviarBLE("Volumen: " + String(volumenAlarma));
      }
      else {

        enviarBLE("Volumen fuera de rango");
      }
    }
    else {

      enviarBLE("Volumen invalido");
    }

    return;
  }

  // ===================================================
  // STATUS
  // ===================================================

  if (c == "status") {

    Serial.println();
    Serial.println("========== STATUS ==========");

    Serial.printf("Hora actual: %02d:%02d:%02d (%s)\n",
                  horaActual, minutoActual, segundoActual, DIAS_LARGO[diaActual]);

    Serial.println("Horario semanal (am = alarma | pm = dormir):");

    for (int d = 1; d <= 7; d++) {

      Serial.printf("  %-8s ", DIAS_LARGO[d]);

      if (alarmaDiaOn[d]) {
        Serial.printf("alarma %02d:%02d", horaAlarma[d], minutoAlarma[d]);
      }
      else {
        Serial.print("alarma   off");
      }

      Serial.print(" | ");

      if (suenoDiaOn[d]) {
        Serial.printf("dormir %02d:%02d (luz desde %02d:%02d)",
                      horaDormir[d], minutoDormir[d],
                      (horaDormir[d] * 60 + minutoDormir[d] - 60 + 1440) / 60 % 24,
                      (horaDormir[d] * 60 + minutoDormir[d] - 60 + 1440) % 60);
      }
      else {
        Serial.print("dormir   off");
      }

      Serial.println();
    }

    Serial.printf("Sonido: %s | Volumen: %d%%\n", nombreSonido(), volumenAlarma);
    Serial.print("Alarma sonando: "); Serial.println(alarmaSonando ? "SI" : "NO");
    Serial.print("Telefono: ");       Serial.println(celularDetectado ? "PRESENTE" : "AUSENTE");
    Serial.print("Temporizador: ");   Serial.println(temporizadorActivo ? "ACTIVO" : "INACTIVO");
    Serial.print("Luz sueno: ");      Serial.println(luzSuenoEncendida ? "ENCENDIDA" : "APAGADA");
    Serial.print("LDR: ");            Serial.println(valorLDR);

#if SUNI_TELEMETRIA_WIFI
    Serial.print("WiFi: ");
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(WiFi.localIP());
    }
    else {
      Serial.println("sin conexion");
    }
#else
    Serial.println("WiFi: desactivado (hora por BLE)");
#endif

    Serial.println("============================");

    // Resumen corto por BLE (notificaciones <= 20 bytes)
    char resumen[20];
    snprintf(resumen, sizeof(resumen), "%02d:%02d:%02d %s %02d:%02d",
             horaActual, minutoActual, segundoActual,
             DIAS[diaActual], horaAlarma[diaActual], minutoAlarma[diaActual]);

    enviarBLE(resumen);
    return;
  }

  // ===================================================
  // STOP
  // ===================================================

  if (c == "stop") {

    detenerAlarma();

    Serial.println("Alarma detenida manualmente.");
    enviarBLE("Alarma detenida");
    return;
  }

  // ===================================================
  // TEST (prueba de sonido: NO consume la alarma del día)
  // ===================================================

  if (c == "test") {

    alarmaSonando = true;
    inicioAlarma = millis();
    ultimoTono = -1;

    Serial.println();
    Serial.println("TEST: alarma activada.");
    enviarBLE("Test alarma");
    return;
  }

  Serial.println("Comando no reconocido.");
  enviarBLE("Comando invalido");
}

// =====================================================
// ACTUALIZAR HORA
// Reloj de software sin deriva: se suma 1000 ms exactos
// por segundo transcurrido (el reloj se fija desde el
// navegador con SETTIME cada 30 segundos).
// =====================================================

void actualizarHora() {

  unsigned long ahora = millis();

  while (ahora - ultimoSegundo >= 1000) {

    // += 1000 (nunca = ahora): no pierde los ms del loop
    ultimoSegundo += 1000;

    segundoActual++;

    if (segundoActual >= 60) {
      segundoActual = 0;
      minutoActual++;
    }

    if (minutoActual >= 60) {
      minutoActual = 0;
      horaActual++;
    }

    if (horaActual >= 24) {

      horaActual = 0;
      diaActual = diaActual % 7 + 1;
      alarmaYaEjecutadaHoy = false;

      Serial.printf("Nuevo dia: %s.\n", DIAS_LARGO[diaActual]);
    }
  }

  static int minutoImpreso = -1;

  if (minutoActual != minutoImpreso) {

    minutoImpreso = minutoActual;

    Serial.printf("Hora actual: %02d:%02d (%s)\n",
                  horaActual, minutoActual, DIAS_LARGO[diaActual]);
  }
}

// =====================================================
// ENVIAR ESTADO AL SERVIDOR WEB (TELEMETRÍA OPCIONAL)
// Nunca se envía mientras suena la alarma o corre el
// temporizador: el POST es bloqueante y no debe
// interferir con el sonido.
// =====================================================

void enviarEstadoAlServidor() {

#if !SUNI_TELEMETRIA_WIFI

  // Sin WiFi no hay nada que reportar
  return;

#else

  if (!wifiConfigurada()) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (alarmaSonando || temporizadorActivo) {
    return;
  }

  if (millis() - ultimoPOST < INTERVALO_POST) {
    return;
  }

  ultimoPOST = millis();

  HTTPClient http;

  http.setConnectTimeout(2000);
  http.setTimeout(2000);

  http.begin(String(SERVER_URL) + "/api/device/status");
  http.addHeader("Content-Type", "application/json");

  char contenido[340];

  snprintf(
    contenido,
    sizeof(contenido),
    "{\"hora\":%d,\"minuto\":%d,\"segundo\":%d,\"dia\":%d,\"ldr\":%d,"
    "\"telefono\":%s,\"alarma_sonando\":%s,\"sonido\":\"%s\","
    "\"volumen\":%d,\"modo_sueno\":%s,\"temporizador_activo\":%s}",
    horaActual,
    minutoActual,
    segundoActual,
    diaActual,
    valorLDR,
    celularDetectado ? "true" : "false",
    alarmaSonando ? "true" : "false",
    nombreSonido(),
    volumenAlarma,
    modoSuenoActivo ? "true" : "false",
    temporizadorActivo ? "true" : "false"
  );

  http.POST(contenido);

  http.end();

#endif
}

// =====================================================
// DETECTAR LUZ CON LDR (teléfono sobre la cama)
// =====================================================

void detectarLuz() {

  static unsigned long ultimoReporte = 0;

  valorLDR = analogRead(PIN_LDR);

  if (valorLDR > UMBRAL_LUZ + MARGEN_LUZ) {
    estadoLuzAnterior = true;
  }
  else if (valorLDR < UMBRAL_LUZ - MARGEN_LUZ) {
    estadoLuzAnterior = false;
  }

  celularDetectado = estadoLuzAnterior;

  if (millis() - ultimoReporte >= 1000) {

    ultimoReporte = millis();

    Serial.print("[LDR] ");
    Serial.print(valorLDR);
    Serial.print(" | Luz: ");
    Serial.print(estadoLuzAnterior ? "ENCENDIDA" : "APAGADA");
    Serial.print(" | Telefono: ");
    Serial.println(celularDetectado ? "PRESENTE" : "AUSENTE");
  }
}

// =====================================================
// VENTANA DE SUEÑO POR DÍA (hora pm − 60 min)
// Cada día tiene su propia hora de dormir; si la
// ventana cruza la medianoche, pertenece al día de la hora de dormir.
// Se evalúa en segundos semanales para incluir domingo -> lunes.
// =====================================================

int inicioVentanaDia(int d) {

  int segDormir = horaDormir[d] * 3600 + minutoDormir[d] * 60;

  return (segDormir - 3600 + 86400) % 86400;
}

bool diaEnVentanaDia(int d) {

  if (!suenoDiaOn[d]) {
    return false;
  }

  int segAhora = horaActual * 3600 + minutoActual * 60 + segundoActual;
  int segDormir = horaDormir[d] * 3600 + minutoDormir[d] * 60;
  return suniInSleepWindow(suniSecondsUntilSleep(diaActual, segAhora, d, segDormir));
}

// Devuelve el día cuya ventana contiene ahora (o -1)
int diaEnVentanaSueno() {

  int selected = -1;
  int nearest = 3601;
  int now = horaActual * 3600 + minutoActual * 60 + segundoActual;
  for (int d = 1; d <= 7; d++) {
    int remaining = suniSecondsUntilSleep(diaActual, now, d,
                                         horaDormir[d] * 3600 + minutoDormir[d] * 60);
    if (suenoDiaOn[d] && suniInSleepWindow(remaining) && remaining < nearest) {
      selected = d;
      nearest = remaining;
    }
  }
  return selected;
}

// =====================================================
// CONTROLAR LA LUZ (ventana de sueño / temporizador)
// Dentro de la ventana: parpadea 1 minuto cada 5 (2 s on / 2 s off),
// con fundido suave; 12 intervalos durante los 60 minutos previos.
// El temporizador anti-sobre-cama tiene prioridad.
// =====================================================

void controlarLuz(int ventana) {

  // Bloqueo físico prioritario: ninguna rutina debe iluminar sin celular.
  // No se confía únicamente en el estado del temporizador.
  if (!celularDetectado) {
    luzObjetivo = 0;
    luzSuenoEncendida = false;
    return;
  }

  // ---------------------------------------------------
  // TEMPORIZADOR ACTIVO: lámpara encendida
  // ---------------------------------------------------

  if (temporizadorActivo) {

    luzObjetivo = 255;
    return;
  }

  // ---------------------------------------------------
  // FUERA DE LA VENTANA: encendida si el celular está presente
  // ---------------------------------------------------

  if (ventana < 0) {

    luzObjetivo = 255;

    if (luzSuenoEncendida) {
      Serial.println("Luz de sueno: APAGADA (fuera de ventana)");
      luzSuenoEncendida = false;
    }

    return;
  }

  // ---------------------------------------------------
  // DENTRO DE LA VENTANA: 1 min de cada 5
  // ---------------------------------------------------

  int segAhora = horaActual * 3600 + minutoActual * 60 + segundoActual;
  int remaining = suniSecondsUntilSleep(diaActual, segAhora, ventana,
                       horaDormir[ventana] * 3600 + minutoDormir[ventana] * 60);
  bool encender = suniSleepLightOn(3600 - remaining);

  if (encender != luzSuenoEncendida) {

    Serial.printf("Luz de sueno: %s (%s)\n",
                  encender ? "ENCENDIDA" : "APAGADA",
                  DIAS_LARGO[ventana]);

    luzSuenoEncendida = encender;
  }

  luzObjetivo = encender ? 255 : 0;
}

// =====================================================
// CONTROLAR ALARMA
// =====================================================

void controlarAlarma() {

  // ---------------------------------------------------
  // COMPROBAR LA HORA AM DEL DÍA ACTUAL
  // Ventana de 10 segundos por si el loop se retrasa
  // ---------------------------------------------------

  if (
    alarmaDiaOn[diaActual] &&
    !alarmaYaEjecutadaHoy &&
    horaActual == horaAlarma[diaActual] &&
    minutoActual == minutoAlarma[diaActual] &&
    segundoActual < 10
  ) {

    alarmaSonando = true;
    inicioAlarma = millis();
    ultimoTono = -1;
    alarmaYaEjecutadaHoy = true;

    Serial.println();
    Serial.println("============================");
    Serial.printf("     ALARMA %s %02d:%02d\n",
                  DIAS_LARGO[diaActual],
                  horaAlarma[diaActual],
                  minutoAlarma[diaActual]);
    Serial.println("============================");
  }

  // ---------------------------------------------------
  // SI LA ALARMA ESTA SONANDO
  // ---------------------------------------------------

  if (alarmaSonando) {

    hacerSonidoAlarma();

    unsigned long tiempoSonando = millis() - inicioAlarma;

    // Primeros 10 segundos: suena sin importar el teléfono
    if (tiempoSonando < TIEMPO_MINIMO_ALARMA) {
      return;
    }

    // Teléfono sobre la cama: se despierta el usuario
    if (celularDetectado) {

      Serial.println();
      Serial.println("Telefono detectado. Alarma desactivada.");

      detenerAlarma();
      iniciarTemporizador();
    }
  }
}

// =====================================================
// SONIDO DE ALARMA
// 4 sonidos seleccionables desde la aplicación, todos
// no bloqueantes:
//   clasico  - 4 pitidos rápidos
//   pajaro   - trinos ascendentes
//   rio      - murmullo continuo suave
//   digital  - bip-bip electrónico
// =====================================================

void hacerSonidoAlarma() {

  unsigned long ahora = millis();

  unsigned long periodo = 1000;

  if (sonidoAlarma == SONIDO_PAJARO) {
    periodo = 1600;
  }

  unsigned long ciclo = (ahora - inicioAlarma) % periodo;

  int frecuencia = 0;

  switch (sonidoAlarma) {

    // CLÁSICO: 4 pitidos cortos -> pausa -> repetir
    case SONIDO_CLASICO:

      if (
        (ciclo >= 160 && ciclo < 240) ||
        (ciclo >= 280 && ciclo < 360) ||
        (ciclo >= 400 && ciclo < 480) ||
        (ciclo >= 520 && ciclo < 620)
      ) {
        frecuencia = 4100;
      }
      break;

    // CANTO DE PÁJARO: trinos cortos y agudos
    case SONIDO_PAJARO:

      if (ciclo < 70) {
        frecuencia = 2400;
      }
      else if (ciclo >= 90 && ciclo < 160) {
        frecuencia = 2900;
      }
      else if (ciclo >= 180 && ciclo < 260) {
        frecuencia = 3400;
      }
      else if (ciclo >= 420 && ciclo < 490) {
        frecuencia = 2600;
      }
      else if (ciclo >= 510 && ciclo < 580) {
        frecuencia = 3100;
      }
      else if (ciclo >= 780 && ciclo < 860) {
        frecuencia = 3600;
      }
      else if (ciclo >= 1000 && ciclo < 1070) {
        frecuencia = 2300;
      }
      else if (ciclo >= 1090 && ciclo < 1160) {
        frecuencia = 2800;
      }
      break;

    // RÍO: murmullo continuo con oscilación suave
    case SONIDO_RIO:

      if (ciclo < 150) {
        frecuencia = 620;
      }
      else if (ciclo < 300) {
        frecuencia = 700;
      }
      else if (ciclo < 450) {
        frecuencia = 660;
      }
      else if (ciclo < 600) {
        frecuencia = 740;
      }
      else if (ciclo < 750) {
        frecuencia = 680;
      }
      else {
        frecuencia = 720;
      }
      break;

    // ALARMA DIGITAL: bip-bip electrónico
    case SONIDO_DIGITAL:

      if (ciclo < 120 || (ciclo >= 480 && ciclo < 600)) {
        frecuencia = 880;
      }
      else if ((ciclo >= 240 && ciclo < 360) || (ciclo >= 720 && ciclo < 840)) {
        frecuencia = 1320;
      }
      break;
  }

  // APLICAR TONO O SILENCIO (solo al cambiar)
  if (frecuencia > 0 && volumenAlarma > 0) {

    if (frecuencia != ultimoTono) {
      tono(frecuencia);
      ultimoTono = frecuencia;
    }
  }
  else {

    if (ultimoTono != 0) {
      silencio();
      ultimoTono = 0;
    }
  }
}

// =====================================================
// DETENER ALARMA
// =====================================================

void detenerAlarma() {

  alarmaSonando = false;
  silencio();
  ultimoTono = 0;

  Serial.println("Buzzer apagado.");
}

// =====================================================
// INICIAR TEMPORIZADOR
// =====================================================

void iniciarTemporizador() {

  temporizadorActivo = true;
  inicioTemporizador = millis();
  ultimoMensajeTemporizador = millis();

  digitalWrite(LED_ROJO, LOW);
  digitalWrite(LED_VERDE, HIGH);

  // La lámpara sube con fundido suave
  luzObjetivo = 255;

  Serial.println();
  Serial.println("============================");
  Serial.println("TEMPORIZADOR INICIADO");
  Serial.printf("Duracion: %lu segundos\n", SEGUNDOS_TELEFONO);
  Serial.println("Lampara ENCENDIDA");
  Serial.println("LED verde ENCENDIDO");
}

// =====================================================
// CONTROLAR TEMPORIZADOR
// =====================================================

void controlarTemporizador() {

  if (!temporizadorActivo) {
    return;
  }

  // ---------------------------------------------------
  // TELEFONO RETIRADO
  // ---------------------------------------------------

  if (!celularDetectado) {

    Serial.println();
    Serial.println("Telefono retirado. Temporizador reiniciado.");

    temporizadorActivo = false;

    // controlarLuz() vuelve a decidir: ventana de sueño o apagada
    luzObjetivo = 0;

    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_ROJO, HIGH);

    // Volver a sonar la alarma
    alarmaSonando = true;
    inicioAlarma = millis();
    ultimoTono = -1;

    Serial.println("Alarma reactivada.");
    return;
  }

  unsigned long tiempoTranscurrido = millis() - inicioTemporizador;

  // Cronómetro por serie (1 mensaje por segundo)
  if (millis() - ultimoMensajeTemporizador >= 1000) {

    ultimoMensajeTemporizador = millis();

    unsigned long segundos = tiempoTranscurrido / 1000;

    if (segundos <= SEGUNDOS_TELEFONO) {
      Serial.printf("Telefono presente | %lu / %lu segundos\n",
                    segundos, SEGUNDOS_TELEFONO);
    }
  }

  // ---------------------------------------------------
  // COMPLETAR LA DURACIÓN
  // ---------------------------------------------------

  if (tiempoTranscurrido >= DURACION_TELEFONO) {

    Serial.println();
    Serial.println("============================");
    Serial.printf("%lu SEGUNDOS COMPLETADOS\n", SEGUNDOS_TELEFONO);
    Serial.println("============================");

    temporizadorActivo = false;

    // La lámpara baja con fundido (o vuelve a la ventana)
    luzObjetivo = 0;

    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_ROJO, HIGH);

    sonidoCelebracion();

    Serial.println("Sistema listo.");
  }
}

// =====================================================
// SONIDO DE CELEBRACIÓN
// Melodía juguetona y alegre (respeta el volumen)
// =====================================================

void sonidoCelebracion() {

  Serial.println("Sonido de celebracion alegre.");

  tono(784);   // G5
  delay(120);
  silencio();
  delay(50);

  tono(988);   // B5
  delay(120);
  silencio();
  delay(50);

  tono(1175);  // D6
  delay(120);
  silencio();
  delay(50);

  tono(1568);  // G6
  delay(180);
  silencio();
  delay(70);

  // Remate juguetón
  tono(1175);  // D6
  delay(100);
  silencio();
  delay(40);

  tono(1568);  // G6
  delay(250);
  silencio();

  Serial.println("Celebracion terminada.");
}

// =====================================================
// ENVIAR MENSAJE POR BLE
// (las notificaciones cortas viajan sin ampliar el MTU)
// =====================================================

void enviarBLE(String mensaje) {

  if (deviceConnected && pCharacteristic != nullptr) {

    pCharacteristic->setValue(mensaje.c_str());
    pCharacteristic->notify();

    Serial.print("BLE enviado: ");
    Serial.println(mensaje);
  }
}
