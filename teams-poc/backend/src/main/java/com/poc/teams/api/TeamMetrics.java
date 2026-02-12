package com.poc.teams.api;

public class TeamMetrics {
  private int headcount;
  private int activeProjects;
  private int totalProjects;
  private int totalAssignments;
  private double averageUtilization;

  public TeamMetrics(int headcount, int activeProjects, int totalProjects, int totalAssignments, double averageUtilization) {
    this.headcount = headcount;
    this.activeProjects = activeProjects;
    this.totalProjects = totalProjects;
    this.totalAssignments = totalAssignments;
    this.averageUtilization = averageUtilization;
  }

  public int getHeadcount() {
    return headcount;
  }

  public int getActiveProjects() {
    return activeProjects;
  }

  public int getTotalProjects() {
    return totalProjects;
  }

  public int getTotalAssignments() {
    return totalAssignments;
  }

  public double getAverageUtilization() {
    return averageUtilization;
  }
}
