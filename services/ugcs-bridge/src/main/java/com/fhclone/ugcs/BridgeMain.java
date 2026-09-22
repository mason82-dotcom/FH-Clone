package com.fhclone.ugcs;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import com.ugcs.ucs.client.Client;
import com.ugcs.ucs.client.ClientSession;
import com.ugcs.ucs.proto.DomainProto.DomainObjectWrapper;
import com.ugcs.ucs.proto.DomainProto.EventWrapper;
import com.ugcs.ucs.proto.DomainProto.Route;
import com.ugcs.ucs.proto.DomainProto.Telemetry;
import com.ugcs.ucs.proto.DomainProto.TelemetryEvent;
import com.ugcs.ucs.proto.DomainProto.TelemetryField;
import com.ugcs.ucs.proto.DomainProto.Value;
import com.ugcs.ucs.proto.DomainProto.Vehicle;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;

public final class BridgeMain {
    private static final String SDK_VERSION = "5.17.1";

    private final Client client;
    private final ClientSession session;
    private final String ucsHost;
    private final int ucsPort;
    private final Map<String, Map<String, TelemetryValue>> telemetry = new ConcurrentHashMap<>();
    private int telemetrySubscription = -1;

    private BridgeMain(String host, int port) {
        this.ucsHost = host;
        this.ucsPort = port;
        this.client = new Client(new InetSocketAddress(host, port));
        this.session = new ClientSession(client);
    }

    public static void main(String[] args) throws Exception {
        String ucsHost = env("UGCS_HOST", "localhost");
        int ucsPort = Integer.parseInt(env("UGCS_PORT", "3334"));
        String user = env("UGCS_USER", "");
        String password = env("UGCS_PASSWORD", "");
        String bind = env("BRIDGE_BIND", "0.0.0.0");
        int bridgePort = Integer.parseInt(env("BRIDGE_PORT", "8092"));

        BridgeMain bridge = new BridgeMain(ucsHost, ucsPort);
        bridge.connect(user, password);
        bridge.startHttp(bind, bridgePort);

        Runtime.getRuntime().addShutdownHook(new Thread(bridge::closeQuietly));
    }

    private void connect(String user, String password) throws Exception {
        client.addNotificationListener(event -> {
            EventWrapper wrapper = event.getEvent();
            if (wrapper == null) return;
            TelemetryEvent telemetryEvent = wrapper.getTelemetryEvent();
            if (telemetryEvent == null || telemetryEvent.getVehicle() == null) return;

            Vehicle vehicle = telemetryEvent.getVehicle();
            String vehicleKey = vehicleKey(vehicle);
            Map<String, TelemetryValue> values =
                    telemetry.computeIfAbsent(vehicleKey, ignored -> new ConcurrentHashMap<>());

            for (Telemetry item : telemetryEvent.getTelemetryList()) {
                TelemetryField field = item.getTelemetryField();
                if (field == null) continue;
                String key = field.getSubsystem().name() + "." + field.getCode();
                values.put(key, new TelemetryValue(
                        item.getTime(),
                        valueOf(item.getValue()),
                        field.hasSemantic() ? field.getSemantic().name() : null,
                        field.hasSubsystem() ? field.getSubsystem().name() : null,
                        field.getCode()));
            }
        });

        client.connect();
        session.authorizeHci();
        session.login(user, password);
        telemetrySubscription = session.subscribeTelemetryEvent();
    }

    private void startHttp(String bind, int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(bind, port), 0);
        server.createContext("/health", exchange -> handle(exchange, this::healthJson));
        server.createContext("/vehicles", exchange -> handle(exchange, this::vehiclesJson));
        server.createContext("/routes", exchange -> handle(exchange, this::routesJson));
        server.createContext("/telemetry", exchange -> handle(exchange, this::telemetryJson));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        System.out.printf("FH-Clone UgCS bridge listening on %s:%d; UCS=%s:%d%n",
                bind, port, ucsHost, ucsPort);
    }

    private String healthJson() {
        return "{"
                + "\"connected\":" + client.isConnected() + ","
                + "\"version\":" + quote(SDK_VERSION) + ","
                + "\"details\":{"
                + "\"ucsHost\":" + quote(ucsHost) + ","
                + "\"ucsPort\":" + ucsPort
                + "}}";
    }

    private String vehiclesJson() throws Exception {
        List<DomainObjectWrapper> objects = session.getObjectList(Vehicle.class);
        StringBuilder json = new StringBuilder("[");
        boolean first = true;

        for (DomainObjectWrapper wrapper : objects) {
            Vehicle vehicle = wrapper.getVehicle();
            if (vehicle == null) continue;
            if (!first) json.append(',');
            first = false;

            json.append('{')
                    .append("\"id\":").append(quote(Integer.toString(vehicle.getId()))).append(',')
                    .append("\"name\":").append(quote(vehicle.getName())).append(',')
                    .append("\"serialNumber\":").append(quote(vehicle.getTailNumber())).append(',')
                    .append("\"connected\":true")
                    .append('}');
        }
        return json.append(']').toString();
    }

    private String routesJson() throws Exception {
        List<DomainObjectWrapper> objects = session.getObjectList(Route.class);
        StringBuilder json = new StringBuilder("[");
        boolean first = true;

        for (DomainObjectWrapper wrapper : objects) {
            Route route = wrapper.getRoute();
            if (route == null) continue;
            if (!first) json.append(',');
            first = false;

            json.append('{')
                    .append("\"id\":").append(quote(Integer.toString(route.getId()))).append(',')
                    .append("\"name\":").append(quote(route.getName())).append(',')
                    .append("\"segments\":[");

            boolean firstSegment = true;
            for (var segment : route.getSegmentsList()) {
                if (!segment.hasFigure()) continue;
                var figure = segment.getFigure();
                if (figure.getPointsCount() == 0) continue;

                if (!firstSegment) json.append(',');
                firstSegment = false;

                json.append('{')
                        .append("\"id\":").append(quote(Integer.toString(segment.getId()))).append(',')
                        .append("\"figureType\":").append(quote(figure.getType().name())).append(',')
                        .append("\"points\":[");

                boolean firstPoint = true;
                for (var point : figure.getPointsList()) {
                    if (!firstPoint) json.append(',');
                    firstPoint = false;

                    json.append('{')
                            .append("\"latitudeDeg\":")
                            .append(Math.toDegrees(point.getLatitude())).append(',')
                            .append("\"longitudeDeg\":")
                            .append(Math.toDegrees(point.getLongitude()));

                    if (point.hasWgs84Altitude()) {
                        json.append(",\"altitudeM\":").append(point.getWgs84Altitude());
                    }
                    if (point.hasAglAltitude()) {
                        json.append(",\"aglAltitudeM\":").append(point.getAglAltitude());
                    }

                    json.append('}');
                }

                json.append("]}");
            }

            json.append("]}");
        }
        return json.append(']').toString();
    }

    private String telemetryJson() {
        StringBuilder json = new StringBuilder("{");
        boolean firstVehicle = true;

        for (Map.Entry<String, Map<String, TelemetryValue>> vehicle : telemetry.entrySet()) {
            if (!firstVehicle) json.append(',');
            firstVehicle = false;
            json.append(quote(vehicle.getKey())).append(":{");

            boolean firstField = true;
            for (Map.Entry<String, TelemetryValue> field : vehicle.getValue().entrySet()) {
                if (!firstField) json.append(',');
                firstField = false;
                TelemetryValue value = field.getValue();
                json.append(quote(field.getKey()))
                        .append(":{\"time\":").append(value.time())
                        .append(",\"value\":").append(jsonValue(value.value()));
                if (value.semantic() != null) {
                    json.append(",\"semantic\":").append(quote(value.semantic()));
                }
                if (value.subsystem() != null) {
                    json.append(",\"subsystem\":").append(quote(value.subsystem()));
                }
                if (value.code() != null && !value.code().isBlank()) {
                    json.append(",\"code\":").append(quote(value.code()));
                }
                json.append('}');
            }
            json.append('}');
        }
        return json.append('}').toString();
    }

    private void handle(HttpExchange exchange, JsonSupplier supplier) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            exchange.close();
            return;
        }

        try {
            byte[] body = supplier.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
        } catch (Exception error) {
            byte[] body = ("{\"error\":" + quote(error.getMessage()) + "}")
                    .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(500, body.length);
            exchange.getResponseBody().write(body);
        } finally {
            exchange.close();
        }
    }

    private void closeQuietly() {
        try {
            if (telemetrySubscription >= 0) {
                session.unsubscribe(telemetrySubscription);
            }
        } catch (Exception ignored) {
        }
        try {
            client.close();
        } catch (Exception ignored) {
        }
    }

    private static String vehicleKey(Vehicle vehicle) {
        if (vehicle.getTailNumber() != null && !vehicle.getTailNumber().isBlank()) {
            return vehicle.getTailNumber();
        }
        if (vehicle.getName() != null && !vehicle.getName().isBlank()) {
            return vehicle.getName();
        }
        return Integer.toString(vehicle.getId());
    }

    private static Object valueOf(Value value) {
        if (value == null) return null;
        if (value.hasFloatValue()) return value.getFloatValue();
        if (value.hasDoubleValue()) return value.getDoubleValue();
        if (value.hasIntValue()) return value.getIntValue();
        if (value.hasLongValue()) return value.getLongValue();
        if (value.hasBoolValue()) return value.getBoolValue();
        if (value.hasStringValue()) return value.getStringValue();
        return null;
    }

    private static String jsonValue(Object value) {
        if (value == null) return "null";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        return quote(value.toString());
    }

    private static String quote(String value) {
        if (value == null) return "null";
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                + "\"";
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    @FunctionalInterface
    private interface JsonSupplier {
        String get() throws Exception;
    }

    private record TelemetryValue(
            long time,
            Object value,
            String semantic,
            String subsystem,
            String code
    ) {}
}
