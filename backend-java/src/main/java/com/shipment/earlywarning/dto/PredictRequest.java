package com.shipment.earlywarning.dto;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class PredictRequest {
    private String originCity;
    private String destinationCity;
    private String shippingMode;
    private String carrierName;
    private String shipmentDate;
    private int slaDeliveryDays;
}
