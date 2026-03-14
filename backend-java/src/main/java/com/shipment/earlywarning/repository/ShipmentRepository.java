package com.shipment.earlywarning.repository;

import com.shipment.earlywarning.entity.Shipment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ShipmentRepository extends JpaRepository<Shipment, Long> {

    List<Shipment> findTop20ByOrderByTimestampDesc();

    @Query("SELECT s.riskLevel, COUNT(s) FROM Shipment s GROUP BY s.riskLevel")
    List<Object[]> countByRiskLevel();

    @Query("SELECT AVG(s.delayProbability) FROM Shipment s")
    Double averageDelayProbability();

    @Query("SELECT COUNT(s) FROM Shipment s WHERE s.riskLevel = 'High'")
    Long countHighRisk();
}
