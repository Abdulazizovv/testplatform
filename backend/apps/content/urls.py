from rest_framework.routers import DefaultRouter

from .views import MediaViewSet, QuestionViewSet, SubjectViewSet, TestViewSet

router = DefaultRouter()
router.include_root_view = False
router.register("subjects", SubjectViewSet, basename="subject")
router.register("tests", TestViewSet, basename="test")
router.register("questions", QuestionViewSet, basename="question")
router.register("media", MediaViewSet, basename="media")

urlpatterns = router.urls
