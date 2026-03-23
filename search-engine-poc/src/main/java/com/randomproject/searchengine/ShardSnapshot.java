package com.randomproject.searchengine;
 
import java.util.List;

public record ShardSnapshot(
        int shardId,
        int documentCount,
        int uniqueTermCount,
        int postingCount,
        List<String> hottestTerms
) {
}
