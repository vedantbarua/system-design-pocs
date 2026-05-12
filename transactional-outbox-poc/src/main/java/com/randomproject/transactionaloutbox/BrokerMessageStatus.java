package com.randomproject.transactionaloutbox;

public enum BrokerMessageStatus {
    READY,
    CONSUMED,
    DUPLICATE,
    DLQ
}
