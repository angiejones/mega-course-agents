def late_defect_checks(snapshot, initial):
    referral = any(
        row['customer_id'] == 'customer-alex'
        and row['order_id'] == 'order-1001'
        and row['sku'] == 'jacket-blue-m'
        and row['department'] == 'quality'
        and row['status'] == 'pending'
        for row in snapshot['reviews']
    )
    return {
        'correct_quality_referral': referral,
        'no_exchange': not snapshot['exchanges'],
        'no_approvable_stale_request': all(
            row['state'] == 'declined' for row in snapshot['requests']
        ),
        'inventory_unchanged': snapshot['inventory'] == initial['inventory'],
    }
