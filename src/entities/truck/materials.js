import * as THREE from 'three';
import {
  paintMaterial, chromeMaterial, metalMaterial, glassMaterial,
  rubberMaterial, plasticMaterial, lensMaterial, reflectiveMaterial,
} from '../../utils/materials.js';
import { PALETTE } from '../../utils/colors.js';
import { rovaDecalTexture, plateTexture, chevronTexture } from './textures.js';

const C = PALETTE.truck;

/**
 * The truck's material set, built once per truck.
 *
 * These are instances rather than shared singletons on purpose: the truck
 * animates `emissiveIntensity` on the brake, reverse and indicator lenses, so
 * sharing them with anything else in the scene would make unrelated objects
 * flash when you touch the brakes.
 */
export function createTruckMaterials() {
  const decalTex = rovaDecalTexture();
  return {

      cabPaint: paintMaterial(C.cab, { metalness: 0.15, roughness: 0.3 }),
      bodyPaint: paintMaterial(C.container, { metalness: 0.45, roughness: 0.38 }),
      bodyPaintDark: paintMaterial(C.containerDark, { metalness: 0.45, roughness: 0.42 }),
      chrome: chromeMaterial(),
      metal: metalMaterial(),
      darkMetal: metalMaterial(0x33373c, { roughness: 0.5 }),
      glass: glassMaterial(),
      rubber: rubberMaterial(),
      bumper: plasticMaterial(0x2e3237, { roughness: 0.6 }),
      trim: plasticMaterial(0x1c1f23, { roughness: 0.75 }),
      hydraulic: chromeMaterial(0xd8dde2, { roughness: 0.05 }),
      armPaint: paintMaterial(C.arm, { metalness: 0.25, roughness: 0.45 }),
      amber: lensMaterial(0xffa71a, 1.1),
      chargeLamp: lensMaterial(0x4dffa8, 1.6),
      indicator: lensMaterial(0xff8c1a, 0.12),
      arch: plasticMaterial(0x15181c, { roughness: 0.95 }),
    // Hopper recess. Flat shading casts no shadow, so the sense of depth is
    // carried entirely by value — these must sit well below the bodywork.
    hopperDark: plasticMaterial(0x2b322d),
    hopperFloor: plasticMaterial(0x5f6d63),
      rim: new THREE.MeshStandardMaterial({
        color: 0xe4e9ee, metalness: 0.45, roughness: 0.3, envMapIntensity: 1.2,
      }),
      stripeRed: reflectiveMaterial(0xd42a1a),
      stripeWhite: reflectiveMaterial(0xf2f2f2),
      drl: lensMaterial(0xdfefff, 1.5),
      headlight: lensMaterial(0xfff6de, 1.0),
      tail: lensMaterial(0xff2a1f, 0.55),
      reverse: lensMaterial(0xffffff, 0.0),
      reflective: reflectiveMaterial(0xf5e400),
      decal: new THREE.MeshStandardMaterial({
        map: decalTex, transparent: true, roughness: 0.45, metalness: 0.0,
        envMapIntensity: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
      }),
      plate: new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.5, metalness: 0.1 }),
      chevron: new THREE.MeshStandardMaterial({
        map: chevronTexture(), roughness: 0.45, metalness: 0.2,
        emissiveMap: chevronTexture(), emissive: 0xffffff, emissiveIntensity: 0.25,
      }),
      };
}
