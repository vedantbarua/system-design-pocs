package com.randomproject.transactionaloutbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class TransactionalOutboxPocApplication {
    public static void main(String[] args) {
        SpringApplication.run(TransactionalOutboxPocApplication.class, args);
    }
}
