package com.randomproject.distributedstream;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record CreateStreamRequest(
        @NotBlank @Size(max = 40) String stream,
        @Min(1) @Max(8) Integer partitions,
        @Min(5) @Max(300) Integer windowSeconds) {
}

record PublishEventRequest(
        @NotBlank @Size(max = 40) String stream,
        @Size(max = 80) String key,
        @NotNull Integer value,
        @Min(0) Long eventTimeMillis,
        @Min(0) Integer partition) {
}

record ProcessBatchRequest(
        @NotBlank @Size(max = 40) String stream,
        @NotBlank @Size(max = 40) String jobId,
        @Min(1) @Max(64) Integer maxRecords) {
}

record CheckpointRequest(
        @NotBlank @Size(max = 40) String stream,
        @NotBlank @Size(max = 40) String jobId,
        @NotBlank @Size(max = 40) String checkpointId) {
}

record ReplayRequest(
        @NotBlank @Size(max = 40) String stream,
        @NotBlank @Size(max = 40) String jobId,
        @Min(0) Integer partition,
        @Min(0) Long nextOffset,
        @Size(max = 40) String checkpointId,
        Boolean clearState) {
}
