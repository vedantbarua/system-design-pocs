package com.poc.matchingengine.engine;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicLongArray;
import java.util.concurrent.locks.LockSupport;

public class RingBufferQueue<T> {
  private final Object[] buffer;
  private final int size;
  private final long mask;
  private final AtomicLong nextSequence = new AtomicLong(0);
  private final AtomicLong consumerSequence = new AtomicLong(-1);
  private final AtomicLongArray published;

  public RingBufferQueue(int size) {
    if (Integer.bitCount(size) != 1) {
      throw new IllegalArgumentException("Ring buffer size must be power of two");
    }
    this.size = size;
    this.mask = size - 1L;
    this.buffer = new Object[size];
    this.published = new AtomicLongArray(size);
    for (int i = 0; i < size; i++) {
      published.set(i, -1L);
    }
  }

  public long next() {
    long seq = nextSequence.getAndIncrement();
    while (seq - size > consumerSequence.get()) {
      LockSupport.parkNanos(1L);
    }
    return seq;
  }

  public void publish(long sequence, T event) {
    int index = (int) (sequence & mask);
    buffer[index] = event;
    published.set(index, sequence);
  }

  @SuppressWarnings("unchecked")
  public T waitFor(long sequence) {
    int index = (int) (sequence & mask);
    while (published.get(index) != sequence) {
      if (Thread.currentThread().isInterrupted()) {
        return null;
      }
      LockSupport.parkNanos(1L);
    }
    return (T) buffer[index];
  }

  public void markConsumed(long sequence) {
    int index = (int) (sequence & mask);
    buffer[index] = null;
    consumerSequence.set(sequence);
  }
}
