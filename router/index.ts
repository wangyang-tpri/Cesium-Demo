import { createRouter, createWebHashHistory } from 'vue-router';
import BasicsIndex from '@/views/business/basics/index.vue';
import ForwardIndex from '@/views/business/forward/index.vue';
import ApplicationIndex from '@/views/business/application/index.vue';

// 基础篇
import ViewerPage from '@/views/business/basics/Viewer/index.vue';
import CameraPage from '@/views/business/basics/Camera/index.vue';
import ImageryTerrainPage from '@/views/business/basics/ImageryTerrain/index.vue';
import EntityPage from '@/views/business/basics/Entity/index.vue';
import CoordinatesPage from '@/views/business/basics/Coordinates/index.vue';
import MaterialPage from '@/views/business/basics/Material/index.vue';
import EventPage from '@/views/business/basics/Event/index.vue';
import ClockPage from '@/views/business/basics/Clock/index.vue';
import PrimitivePage from '@/views/business/basics/Primitive/index.vue';
import LabelBillboardPage from '@/views/business/basics/LabelBillboard/index.vue';

// 进阶篇
import TilesetPage from '@/views/business/forward/Tileset/index.vue';
import ModelPage from '@/views/business/forward/Model/index.vue';
import ParticlesPage from '@/views/business/forward/Particles/index.vue';
import PostProcessPage from '@/views/business/forward/PostProcess/index.vue';
import PickingPage from '@/views/business/forward/Picking/index.vue';
import GeoJsonPage from '@/views/business/forward/GeoJson/index.vue';
import DynamicPage from '@/views/business/forward/Dynamic/index.vue';
import CustomShaderPage from '@/views/business/forward/CustomShader/index.vue';

// 应用篇
import FlightPage from '@/views/business/application/Flight/index.vue';
import MeasurePage from '@/views/business/application/Measure/index.vue';
import TrajectoryPage from '@/views/business/application/Trajectory/index.vue';
import SceneApplicationIndex from '@/views/business/application/SceneApplication/index.vue';
import SpatialAnalysisIndex from '@/views/business/application/SpatialAnalysis/index.vue';
import LineOfSightPage from '@/views/business/application/SpatialAnalysis/LineOfSight/index.vue';
import ProfilePage from '@/views/business/application/SpatialAnalysis/Profile/index.vue';
import BufferPage from '@/views/business/application/SpatialAnalysis/Buffer/index.vue';
import ViewshedPage from '@/views/business/application/SpatialAnalysis/Viewshed/index.vue';
import FloodPage from '@/views/business/application/SpatialAnalysis/Flood/index.vue';
import PlanningDesignIndex from '@/views/business/application/PlanningDesign/index.vue';
import PathPlanningPage from '@/views/business/application/PlanningDesign/PathPlanning/index.vue';
import ZoneDivisionPage from '@/views/business/application/PlanningDesign/ZoneDivision/index.vue';
import SiteSelectionPage from '@/views/business/application/PlanningDesign/SiteSelection/index.vue';
import EarthworkPage from '@/views/business/application/PlanningDesign/Earthwork/index.vue';
import InteractionToolsIndex from '@/views/business/application/InteractionTools/index.vue';
import CoordinatePickPage from '@/views/business/application/InteractionTools/CoordinatePick/index.vue';
import PrimitiveDrawPage from '@/views/business/application/InteractionTools/PrimitiveDraw/index.vue';
import AnnotationPage from '@/views/business/application/InteractionTools/Annotation/index.vue';
import LayerSwitchPage from '@/views/business/application/InteractionTools/LayerSwitch/index.vue';
import IndustryApplicationIndex from '@/views/business/application/IndustryApplication/index.vue';
import SmartCityPage from '@/views/business/application/IndustryApplication/SmartCity/index.vue';
import WaterConservancyPage from '@/views/business/application/IndustryApplication/WaterConservancy/index.vue';
import PowerInspectionPage from '@/views/business/application/IndustryApplication/PowerInspection/index.vue';
import EmergencyCommandPage from '@/views/business/application/IndustryApplication/EmergencyCommand/index.vue';

const routes = [
  {
    path: '/',
    redirect: '/basics/viewer',
  },
  // 基础：一级目录 + children 子页面
  {
    path: '/basics',
    name: 'basics',
    component: BasicsIndex,
    redirect: '/basics/viewer',
    children: [
      { path: 'viewer', name: 'viewer', component: ViewerPage },
      { path: 'camera', name: 'camera', component: CameraPage },
      { path: 'imagery-terrain', name: 'imagery-terrain', component: ImageryTerrainPage },
      { path: 'entity', name: 'entity', component: EntityPage },
      { path: 'coordinates', name: 'coordinates', component: CoordinatesPage },
      { path: 'material', name: 'material', component: MaterialPage },
      { path: 'event', name: 'event', component: EventPage },
      { path: 'clock', name: 'clock', component: ClockPage },
      { path: 'primitive', name: 'primitive', component: PrimitivePage },
      { path: 'label-billboard', name: 'label-billboard', component: LabelBillboardPage },
    ],
  },
  // 进阶：一级目录 + children 子页面
  {
    path: '/forward',
    name: 'forward',
    component: ForwardIndex,
    redirect: '/forward/tileset',
    children: [
      { path: 'tileset', name: 'tileset', component: TilesetPage },
      { path: 'model', name: 'model', component: ModelPage },
      { path: 'particles', name: 'particles', component: ParticlesPage },
      { path: 'post-process', name: 'post-process', component: PostProcessPage },
      { path: 'picking', name: 'picking', component: PickingPage },
      { path: 'geojson', name: 'geojson', component: GeoJsonPage },
      { path: 'dynamic', name: 'dynamic', component: DynamicPage },
      { path: 'custom-shader', name: 'custom-shader', component: CustomShaderPage },
    ],
  },
  // 应用：一级目录 + children 子页面
  {
    path: '/application',
    name: 'application',
    component: ApplicationIndex,
    redirect: '/application/scene-application/flight',
    children: [
      {
        path: 'scene-application',
        name: 'scene-application',
        component: SceneApplicationIndex,
        redirect: '/application/scene-application/flight',
        children: [
          { path: 'flight', name: 'flight', component: FlightPage },
          { path: 'measure', name: 'measure', component: MeasurePage },
          { path: 'trajectory', name: 'trajectory', component: TrajectoryPage },
        ],
      },
      {
        path: 'spatial-analysis',
        name: 'spatial-analysis',
        component: SpatialAnalysisIndex,
        redirect: '/application/spatial-analysis/line-of-sight',
        children: [
          { path: 'line-of-sight', name: 'line-of-sight', component: LineOfSightPage },
          { path: 'profile', name: 'profile', component: ProfilePage },
          { path: 'buffer', name: 'buffer', component: BufferPage },
          { path: 'viewshed', name: 'viewshed', component: ViewshedPage },
          { path: 'flood', name: 'flood', component: FloodPage },
        ],
      },
      {
        path: 'planning-design',
        name: 'planning-design',
        component: PlanningDesignIndex,
        redirect: '/application/planning-design/path-planning',
        children: [
          { path: 'path-planning', name: 'path-planning', component: PathPlanningPage },
          { path: 'zone-division', name: 'zone-division', component: ZoneDivisionPage },
          { path: 'site-selection', name: 'site-selection', component: SiteSelectionPage },
          { path: 'earthwork', name: 'earthwork', component: EarthworkPage },
        ],
      },
      {
        path: 'interaction-tools',
        name: 'interaction-tools',
        component: InteractionToolsIndex,
        redirect: '/application/interaction-tools/coordinate-pick',
        children: [
          { path: 'coordinate-pick', name: 'coordinate-pick', component: CoordinatePickPage },
          { path: 'primitive-draw', name: 'primitive-draw', component: PrimitiveDrawPage },
          { path: 'annotation', name: 'annotation', component: AnnotationPage },
          { path: 'layer-switch', name: 'layer-switch', component: LayerSwitchPage },
        ],
      },
      {
        path: 'industry-application',
        name: 'industry-application',
        component: IndustryApplicationIndex,
        redirect: '/application/industry-application/smart-city',
        children: [
          { path: 'smart-city', name: 'smart-city', component: SmartCityPage },
          { path: 'water-conservancy', name: 'water-conservancy', component: WaterConservancyPage },
          { path: 'power-inspection', name: 'power-inspection', component: PowerInspectionPage },
          { path: 'emergency-command', name: 'emergency-command', component: EmergencyCommandPage },
        ],
      },
    ],
  },
];

export default createRouter({
  history: createWebHashHistory(),
  routes,
});
