package com.randomproject.mediumpoc;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

@Controller
public class ArticleController {

    @Autowired
    private ArticleRepository articleRepository;

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("articles", articleRepository.findAll());
        return "home";
    }

    @GetMapping("/article/{id}")
    public String viewArticle(@PathVariable Long id, Model model) {
        Article article = articleRepository.findById(id).orElse(null);
        model.addAttribute("article", article);
        return "article";
    }

    @GetMapping("/new")
    public String newArticleForm(Model model) {
        model.addAttribute("article", new Article());
        return "new-article";
    }

    @PostMapping("/new")
    public String saveArticle(@ModelAttribute Article article) {
        articleRepository.save(article);
        return "redirect:/";
    }
}