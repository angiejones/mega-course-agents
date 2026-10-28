export const serviceDescriptions: Record<string, { description: string; skillDescription: string }> = {
  'delivery-investigation': {
    description: 'Helps retail businesses resolve disputed deliveries with the shipping company.',
    skillDescription: 'Investigate a shipment identified by its tracking ID, assess recovery against a deadline, and return findings and recovery timing. Request customer clarification when needed. Does not book recovery.',
  },
  'product-sourcing': {
    description: 'Helps retail businesses source products from supplier inventory.',
    skillDescription: 'Find products matching size, preferences, budget and delivery deadline. Return validated offers with total prices, estimated arrivals and quote expiry, and reserve an approved quote. A reservation is not payment or dispatch.',
  },
  'customer-service': {
    description: 'Helps the authenticated customer resolve shopping and order problems with the retailer.',
    skillDescription: 'Handle customer messages about missing deliveries, coordinate investigation and product sourcing, and present options and proposals. Request clarification or separate purchase confirmation when needed, and report the resulting case status.',
  },
};
