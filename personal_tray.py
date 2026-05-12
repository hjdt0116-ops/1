"""
블렌더 개인트레이 모양 생성 스크립트
실행: 블렌더 스크립팅 탭에서 이 파일을 열고 실행하세요.
"""

import bpy
import bmesh
from mathutils import Vector

# 기존 오브젝트 정리
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def make_personal_tray(
    length=0.35,       # 트레이 길이 (X축, 단위: m)
    width=0.25,        # 트레이 너비 (Y축)
    height=0.04,       # 트레이 높이
    thickness=0.003,   # 벽 두께
    corner_radius=0.015,  # 모서리 라운드
    segments=8,        # 모서리 세그먼트 수
):
    bm = bmesh.new()

    hw = length / 2
    hd = width / 2
    t = thickness
    r = corner_radius
    h = height
    seg = segments

    # 모서리 라운드가 적용된 사각형 윤곽 좌표 생성
    def rounded_rect_2d(lx, ly, rad, segs):
        """중심 기준 2D 라운드 사각형 꼭짓점 목록 반환"""
        import math
        pts = []
        corners = [
            ( lx - rad,  ly - rad, 0),
            (-lx + rad,  ly - rad, math.pi / 2),
            (-lx + rad, -ly + rad, math.pi),
            ( lx - rad, -ly + rad, math.pi * 3 / 2),
        ]
        for cx, cy, start_angle in corners:
            for i in range(segs + 1):
                angle = start_angle + i * (math.pi / 2) / segs
                x = cx + rad * math.cos(angle)
                y = cy + rad * math.sin(angle)
                pts.append((x, y))
        return pts

    # 외부 / 내부 윤곽 계산
    outer_pts = rounded_rect_2d(hw, hd, r, seg)
    inner_pts = rounded_rect_2d(hw - t, hd - t, max(r - t, 0.001), seg)

    n = len(outer_pts)

    # 바닥 외부 루프 (z=0)
    bot_outer = [bm.verts.new(Vector((x, y, 0))) for x, y in outer_pts]
    # 바닥 내부 루프 (z=0, 두께만큼 안쪽)
    bot_inner = [bm.verts.new(Vector((x, y, t))) for x, y in inner_pts]
    # 상단 외부 루프 (z=height)
    top_outer = [bm.verts.new(Vector((x, y, h))) for x, y in outer_pts]
    # 상단 내부 루프 (z=height)
    top_inner = [bm.verts.new(Vector((x, y, h))) for x, y in inner_pts]

    bm.verts.ensure_lookup_table()

    def make_loop_faces(loop_a, loop_b):
        """두 루프 사이에 면 생성"""
        n = len(loop_a)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([loop_a[i], loop_a[j], loop_b[j], loop_b[i]])

    # 외벽 (바닥 외부 → 상단 외부)
    make_loop_faces(bot_outer, top_outer)

    # 내벽 (상단 내부 → 바닥 내부, 법선 방향 반전)
    make_loop_faces(top_inner, bot_inner)

    # 상단 테두리 면 (top_outer → top_inner)
    make_loop_faces(top_outer, top_inner)

    # 바닥 테두리 면 (bot_inner → bot_outer)
    make_loop_faces(bot_inner, bot_outer)

    # 바닥 면 (내부 루프 채우기)
    bm.faces.new(bot_inner)

    # 법선 재계산
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # 메쉬 생성
    mesh = bpy.data.meshes.new("PersonalTray")
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new("PersonalTray", mesh)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    # 스무스 쉐이딩
    bpy.ops.object.shade_smooth()

    # Edge Split 모디파이어 (날카로운 모서리 유지)
    edge_split = obj.modifiers.new(name="EdgeSplit", type='EDGE_SPLIT')
    edge_split.split_angle = 0.5236  # 30도

    # 재질 적용 (플라스틱 느낌)
    mat = bpy.data.materials.new(name="TrayMaterial")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.8, 0.75, 0.65, 1.0)  # 연한 베이지
    bsdf.inputs["Roughness"].default_value = 0.3
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    obj.data.materials.append(mat)

    return obj


tray = make_personal_tray()

# 카메라 시점 맞추기
bpy.ops.view3d.view_selected()

print("개인트레이 생성 완료!")
print(f"  오브젝트: {tray.name}")
print(f"  크기: 350mm x 250mm x 40mm")
print(f"  벽 두께: 3mm")
