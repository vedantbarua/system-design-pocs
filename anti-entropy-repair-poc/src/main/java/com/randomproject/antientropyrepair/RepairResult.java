package com.randomproject.antientropyrepair;

import java.util.List;

public record RepairResult(String message, int repairedKeys, List<String> repairedKeyIds, SystemSnapshot snapshot) {
}
