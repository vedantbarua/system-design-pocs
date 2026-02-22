package com.randomproject.flighttracking;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.baggage.Baggage;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.StatusCode;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.Scope;
import io.opentelemetry.context.propagation.TextMapGetter;
import io.opentelemetry.context.propagation.TextMapPropagator;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.security.SecureRandom;

@Component
public class TraceIdFilter extends OncePerRequestFilter {
    private static final String TRACE_HEADER = "X-Trace-ID";
    private static final String TRACE_BAGGAGE_KEY = "x-trace-id";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Tracer tracer;
    private final TextMapPropagator propagator;

    public TraceIdFilter(OpenTelemetry openTelemetry, Tracer tracer) {
        this.tracer = tracer;
        this.propagator = openTelemetry.getPropagators().getTextMapPropagator();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String incomingTraceId = request.getHeader(TRACE_HEADER);
        String traceId = (incomingTraceId == null || incomingTraceId.isBlank())
                ? generateTraceId()
                : incomingTraceId.trim();

        Context extracted = propagator.extract(Context.current(), request, REQUEST_GETTER);
        Baggage baggage = Baggage.fromContext(extracted).toBuilder()
                .put(TRACE_BAGGAGE_KEY, traceId)
                .build();
        Context contextWithBaggage = baggage.storeInContext(extracted);

        String spanName = request.getMethod() + " " + request.getRequestURI();
        Span span = tracer.spanBuilder(spanName)
                .setSpanKind(SpanKind.SERVER)
                .setParent(contextWithBaggage)
                .startSpan();
        span.setAttribute("x.trace_id", traceId);
        span.setAttribute("http.method", request.getMethod());
        span.setAttribute("http.target", request.getRequestURI());

        response.setHeader(TRACE_HEADER, traceId);

        try (Scope scope = contextWithBaggage.with(span).makeCurrent()) {
            filterChain.doFilter(request, response);
        } catch (Exception ex) {
            span.recordException(ex);
            span.setStatus(StatusCode.ERROR);
            throw ex;
        } finally {
            span.end();
        }
    }

    private static final TextMapGetter<HttpServletRequest> REQUEST_GETTER = new TextMapGetter<>() {
        @Override
        public Iterable<String> keys(HttpServletRequest carrier) {
            return carrier.getHeaderNames() != null
                    ? java.util.Collections.list(carrier.getHeaderNames())
                    : java.util.Collections.emptyList();
        }

        @Override
        public String get(HttpServletRequest carrier, String key) {
            return carrier.getHeader(key);
        }
    };

    private String generateTraceId() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        StringBuilder builder = new StringBuilder(32);
        for (byte b : bytes) {
            builder.append(String.format("%02x", b));
        }
        return builder.toString();
    }
}
