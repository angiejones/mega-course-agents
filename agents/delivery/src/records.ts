// Fictional adapter records, not model instructions or tool schema examples.
export type DeliveryRecord = {
  trackingId: string;
  intendedDeliveryAddress: string;
  scanLocation: string;
  driverNote: string;
  photoDescription: string;
  recoveryDelayHours: number | null;
};
export const deliveryRecords: readonly DeliveryRecord[] = [{
  trackingId: "track-exchange-2001",
  intendedDeliveryAddress: "14 Maple Lane, Springfield, MA 01103, US",
  scanLocation: "Adjacent office building",
  driverNote: "Left with reception",
  photoDescription: "Parcel beside a staffed reception desk",
  recoveryDelayHours: 96,
}];
