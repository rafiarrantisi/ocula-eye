import * as THREE from 'three';

/** Intersect the actual triangles of a closed mesh. Contours are welded and
 * nested before triangulation, so hollow coats and the iris pupil stay hollow.
 * Output coordinates are world coordinates, independent of mirror/explosion. */
export function sectionGeometry(mesh:THREE.Mesh,plane:THREE.Plane){
 mesh.updateWorldMatrix(true,false);
 const bounds=new THREE.Box3().setFromObject(mesh);
 if(!plane.intersectsBox(bounds))return null;
 const n=plane.normal,origin=plane.coplanarPoint(new THREE.Vector3());
 const u=new THREE.Vector3().crossVectors(n,Math.abs(n.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize();
 const v=new THREE.Vector3().crossVectors(n,u).normalize();
 const position=mesh.geometry.getAttribute('position'),index=mesh.geometry.getIndex();
 const points:THREE.Vector2[]=[],lookup=new Map<string,number>(),edges:[number,number][]=[],edgeKeys=new Set<string>();
 const quant=1e6;
 function vertex(p:THREE.Vector3){
  const q=new THREE.Vector2(p.dot(u),p.dot(v)),key=`${Math.round(q.x*quant)},${Math.round(q.y*quant)}`;
  const existing=lookup.get(key);if(existing!==undefined)return existing;
  const id=points.length;lookup.set(key,id);points.push(q);return id;
 }
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 const total=index?index.count:position.count;
 for(let i=0;i<total;i+=3){
  a.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
  b.fromBufferAttribute(position,index?index.getX(i+1):i+1).applyMatrix4(mesh.matrixWorld);
  c.fromBufferAttribute(position,index?index.getX(i+2):i+2).applyMatrix4(mesh.matrixWorld);
  const pp=[a,b,c],dd=pp.map(p=>plane.distanceToPoint(p));
  if(dd.every(d=>d>0)||dd.every(d=>d<0)||dd.every(d=>Math.abs(d)<1e-10))continue;
  const hits:THREE.Vector3[]=[];
  for(let j=0;j<3;j++){
   const k=(j+1)%3,d=dd[j],e=dd[k];
   if((d>=0&&e<0)||(d<0&&e>=0))hits.push(pp[j].clone().lerp(pp[k],d/(d-e)));
  }
  if(hits.length!==2)continue;
  const x=vertex(hits[0]),y=vertex(hits[1]);if(x===y)continue;
  const key=x<y?`${x}/${y}`:`${y}/${x}`;if(edgeKeys.has(key))continue;
  edgeKeys.add(key);edges.push([x,y]);
 }
 if(!edges.length)return null;
 const neighbors=new Map<number,number[]>();
 edges.forEach(([a,b],i)=>{neighbors.set(a,[...(neighbors.get(a)??[]),i]);neighbors.set(b,[...(neighbors.get(b)??[]),i]);});
 const used=new Set<number>(),loops:THREE.Vector2[][]=[];
 for(let seed=0;seed<edges.length;seed++){
  if(used.has(seed))continue;
  const start=edges[seed][0],ids:number[]=[start];let here=start,edge=seed,closed=false;
  for(let guard=0;guard<=edges.length;guard++){
   used.add(edge);const pair=edges[edge],next=pair[0]===here?pair[1]:pair[0];
   if(next===start){closed=true;break;}
   ids.push(next);here=next;const candidate=neighbors.get(here)?.find(i=>!used.has(i));if(candidate===undefined)break;edge=candidate;
  }
  if(closed&&ids.length>=3){const loop=ids.map(i=>points[i]);if(Math.abs(THREE.ShapeUtils.area(loop))>1e-10)loops.push(loop);}
 }
 if(!loops.length)return null;
 // Area ordering lets each loop choose its smallest enclosing parent.
 loops.sort((a,b)=>Math.abs(THREE.ShapeUtils.area(b))-Math.abs(THREE.ShapeUtils.area(a)));
 function contains(poly:THREE.Vector2[],p:THREE.Vector2){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
 const parents=loops.map((loop,i)=>{for(let j=i-1;j>=0;j--)if(contains(loops[j],loop[0]))return j;return -1;});
 const depths:number[]=[];parents.forEach((p,i)=>{depths[i]=p<0?0:depths[p]+1;});
 const out:number[]=[];
 loops.forEach((loop,i)=>{
  if(depths[i]%2)return;
  const holes=loops.filter((_,j)=>parents[j]===i&&depths[j]===depths[i]+1);
  const vertices=loop.concat(...holes),triangles=THREE.ShapeUtils.triangulateShape(loop,holes);
  for(const tri of triangles)for(const k of tri){const p=vertices[k];out.push(...origin.clone().addScaledVector(u,p.x).addScaledVector(v,p.y).toArray());}
 });
 if(!out.length)return null;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();
 g.userData.contourCount=loops.length;g.userData.holeCount=depths.filter(d=>d%2===1).length;
 return g;
}

export function buildSectionCaps(root:THREE.Object3D,plane:THREE.Plane){
 root.updateMatrixWorld(true);const caps=new THREE.Group();caps.name='closed-section-surfaces';
 root.traverse(o=>{
  if(!(o instanceof THREE.Mesh)||o.userData.cataract||!o.visible||!o.parent?.visible)return;
  const source=o.material as THREE.MeshStandardMaterial;
  // Transparent fluids are spaces; opaque cut faces would imply solid tissue.
  if(['vitreous','anterior','posterior'].includes(o.userData.id))return;
  const g=sectionGeometry(o,plane);if(!g)return;
  const material=new THREE.MeshStandardMaterial({color:source.color,roughness:.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.userData.baseOpacity=1;
  const cap=new THREE.Mesh(g,material);cap.userData.id=o.userData.id;cap.userData.sectionCap=true;caps.add(cap);
 });
 return caps;
}
