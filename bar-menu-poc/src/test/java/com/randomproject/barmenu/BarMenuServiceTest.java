package com.randomproject.barmenu;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BarMenuServiceTest {

    @Test
    void startsHelperSessionAtFirstStep() {
        BarMenuService service = new BarMenuService();

        PrepSession session = service.start("margarita");

        assertThat(session.getDrink().name()).isEqualTo("Margarita");
        assertThat(session.getCurrentStep().number()).isEqualTo(1);
        assertThat(session.getProgressPercent()).isZero();
        assertThat(service.recentEvents()).hasSize(1);
    }

    @Test
    void advancesThroughStepsAndMarksComplete() {
        BarMenuService service = new BarMenuService();
        PrepSession session = service.start("gin-and-tonic");

        service.advance(session.getId());
        service.advance(session.getId());
        service.advance(session.getId());
        service.advance(session.getId());

        assertThat(session.getStatus()).isEqualTo(PrepStatus.COMPLETE);
        assertThat(session.getCompletedSteps()).isEqualTo(session.getTotalSteps());
        assertThat(session.getProgressPercent()).isEqualTo(100);
    }

    @Test
    void backFromCompleteReopensLastStep() {
        BarMenuService service = new BarMenuService();
        PrepSession session = service.start("old-fashioned");

        for (int i = 0; i < session.getTotalSteps(); i++) {
            service.advance(session.getId());
        }

        service.back(session.getId());

        assertThat(session.getStatus()).isEqualTo(PrepStatus.ACTIVE);
        assertThat(session.getCurrentStep().number()).isEqualTo(session.getTotalSteps());
    }

    @Test
    void rejectsUnknownDrink() {
        BarMenuService service = new BarMenuService();

        assertThatThrownBy(() -> service.start("missing"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown drink");
    }
}
