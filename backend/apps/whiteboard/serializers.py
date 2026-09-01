from rest_framework import serializers
from .models import WhiteboardSnapshot


class WhiteboardSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhiteboardSnapshot
        fields = ['id', 'lesson', 'data', 'version', 'saved_at']
        read_only_fields = ['id', 'version', 'saved_at']

    def create(self, validated_data):
        lesson = validated_data['lesson']
        last = WhiteboardSnapshot.objects.filter(lesson=lesson).order_by('-version').first()
        validated_data['version'] = (last.version + 1) if last else 1
        return super().create(validated_data)
