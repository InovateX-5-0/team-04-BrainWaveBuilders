package com.shipment.earlywarning.service;

import com.shipment.earlywarning.dto.PredictRequest;
import com.shipment.earlywarning.entity.Shipment;
import com.shipment.earlywarning.repository.ShipmentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class ShipmentService {

    @Autowired
    private ShipmentRepository repo;

    @Autowired
    private RestTemplate restTemplate;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    // ─── Transform and forward to Python AI service ──────────────────────────
    @SuppressWarnings("unchecked")
    public Map<String, Object> predictDelay(PredictRequest req) {
        // Build AI service payload
        Map<String, Object> aiPayload = new HashMap<>();
        aiPayload.put("origin_city",       req.getOriginCity());
        aiPayload.put("destination_city",  req.getDestinationCity());
        aiPayload.put("shipping_mode",     req.getShippingMode());
        aiPayload.put("carrier_name",      req.getCarrierName());
        aiPayload.put("shipment_date",     req.getShipmentDate());
        aiPayload.put("sla_delivery_days", req.getSlaDeliveryDays());

        // Call Python AI microservice
        Map<String, Object> aiResponse;
        try {
            aiResponse = restTemplate.postForObject(
                    aiServiceUrl + "/predict",
                    aiPayload,
                    Map.class
            );
        } catch (Exception e) {
            throw new RuntimeException("AI service unavailable: " + e.getMessage());
        }

        if (aiResponse == null) {
            throw new RuntimeException("Null response from AI service");
        }

        // Save result to MySQL
        double prob = aiResponse.containsKey("delay_probability")
                ? ((Number) aiResponse.get("delay_probability")).doubleValue() : 0.0;

        Shipment shipment = Shipment.builder()
                .originCity(req.getOriginCity())
                .destinationCity(req.getDestinationCity())
                .shippingMode(req.getShippingMode())
                .carrierName(req.getCarrierName())
                .slaDays(req.getSlaDeliveryDays())
                .delayProbability(prob)
                .riskLevel((String) aiResponse.getOrDefault("risk_level", "Unknown"))
                .recommendedAction((String) aiResponse.getOrDefault("recommended_action", ""))
                .build();

        repo.save(shipment);

        // Merge shipmentId into response
        aiResponse.put("shipment_id", shipment.getShipmentId());
        aiResponse.put("stored_at",   shipment.getTimestamp());

        // Add early warning message
        if (prob >= 0.70) {
            aiResponse.put("alert_message", "High probability of shipment delay detected.");
        }

        return aiResponse;
    }

    // ─── History ─────────────────────────────────────────────────────────────
    public List<Shipment> getHistory() {
        return repo.findTop20ByOrderByTimestampDesc();
    }

    // ─── Analytics ───────────────────────────────────────────────────────────
    public Map<String, Object> getAnalytics() {
        Map<String, Object> analytics = new HashMap<>();

        // Risk distribution
        List<Object[]> riskDist = repo.countByRiskLevel();
        Map<String, Long> riskDistMap = new HashMap<>();
        for (Object[] row : riskDist) {
            riskDistMap.put((String) row[0], ((Number) row[1]).longValue());
        }
        analytics.put("risk_distribution", riskDistMap);

        // Average probability
        Double avgProb = repo.averageDelayProbability();
        analytics.put("avg_delay_probability", avgProb != null ? Math.round(avgProb * 10000.0) / 10000.0 : 0.0);

        // Total shipments
        analytics.put("total_shipments", repo.count());

        // High risk count
        analytics.put("high_risk_count", repo.countHighRisk());

        // Recent predictions
        analytics.put("recent_shipments", repo.findTop20ByOrderByTimestampDesc());

        return analytics;
    }
}
