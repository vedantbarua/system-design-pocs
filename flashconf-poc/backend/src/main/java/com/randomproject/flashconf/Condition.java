package com.randomproject.flashconf;

import java.util.List;

public class Condition {
    private String attribute;
    private Operator operator;
    private List<String> values;

    public Condition() {
    }

    public Condition(String attribute, Operator operator, List<String> values) {
        this.attribute = attribute;
        this.operator = operator;
        this.values = values;
    }

    public String getAttribute() {
        return attribute;
    }

    public void setAttribute(String attribute) {
        this.attribute = attribute;
    }

    public Operator getOperator() {
        return operator;
    }

    public void setOperator(Operator operator) {
        this.operator = operator;
    }

    public List<String> getValues() {
        return values;
    }

    public void setValues(List<String> values) {
        this.values = values;
    }
}
