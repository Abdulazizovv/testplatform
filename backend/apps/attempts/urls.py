from django.urls import path

from . import results_views, views

urlpatterns = [
    path("public/branches/", views.BranchListView.as_view()),
    path("public/branches/<slug:slug>/", views.BranchDetailView.as_view()),
    path("public/branches/<slug:slug>/subjects/", views.BranchSubjectListView.as_view()),
    path(
        "public/branches/<slug:slug>/subjects/<slug:subject_slug>/",
        views.BranchSubjectDetailView.as_view(),
    ),
    path("public/subjects/<uuid:pk>/tests/", views.SubjectTestListView.as_view()),
    path("public/tests/<uuid:pk>/", views.TestDetailView.as_view()),
    path("public/tests/<uuid:pk>/attempts/", views.AttemptCreateView.as_view()),
    path("public/attempts/<str:token>/", views.AttemptDetailView.as_view()),
    path("public/attempts/<str:token>/answers/", views.AnswerView.as_view()),
    path("public/attempts/<str:token>/finish/", views.FinishView.as_view()),
    path("public/attempts/<str:token>/result/", views.ResultView.as_view()),
    # Staff results (Phase 3)
    path("results/", results_views.ResultListView.as_view()),
    path("results/export/", results_views.ResultExportView.as_view()),
    path("results/tests/<uuid:pk>/summary/", results_views.TestSummaryView.as_view()),
    path("results/<uuid:pk>/", results_views.ResultDetailView.as_view()),
]
