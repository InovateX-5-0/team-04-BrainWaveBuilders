package com.shipment.earlywarning.controller;

import com.shipment.earlywarning.dto.PredictRequest;
import com.shipment.earlywarning.entity.Shipment;
import com.shipment.earlywarning.service.ShipmentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@CrossOrigin(origins = "*")
public class ShipmentController {

    @Autowired
    private ShipmentService service;

    /** POST /predict-delay – Predict shipment delay risk */
    @PostMapping("/predict-delay")
    public ResponseEntity<?> predictDelay(@RequestBody PredictRequest request) {
        try {
            Map<String, Object> result = service.predictDelay(request);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.status(503)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /** GET /shipments/history – Return last 20 predictions */
    @GetMapping("/shipments/history")
    public ResponseEntity<List<Shipment>> history() {
        return ResponseEntity.ok(service.getHistory());
    }

    /** GET /dashboard/analytics – Dashboard aggregate stats */
    @GetMapping("/dashboard/analytics")
    public ResponseEntity<Map<String, Object>> analytics() {
        return ResponseEntity.ok(service.getAnalytics());
    }

    /** GET /health – Backend health check */
    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "service", "Shipment Early Warning System"));
    }
}
