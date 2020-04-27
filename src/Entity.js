import Component from './Component';
import EntityEvent from './EntityEvent';

export default class Entity {
    #id = null;
    #components = {};
    #ecs = null;

    get id() {
        return this.#id;
    }

    get ecs() {
        return this.#ecs;
    }

    get components() {
        return this.#components;
    }

    constructor(ecs, id = null) {
        this.#ecs = ecs;
        this.#id = id || ecs.generateId();
    }

    has(typeOrClass, key = null) {
        const type = this.ecs.components._getType(typeOrClass);
        const hasType = this.hasOwnProperty(type);

        if (hasType && key) {
            return this[type].hasOwnProperty(key);
        }

        return hasType;
    }

    get(typeOrClass, key = null) {
        const type = this.ecs.components._getType(typeOrClass);
        const components = this[type];

        if (components && key) {
            return components[key];
        }

        return components;
    }

    add(component) {
        if (component.isAttached) {
            console.warn(
                `Cannot add "${component.type}" component since it is already attached to an entity.`
            );
        }

        if (!component.allowMultiple) {
            if (this.has(component.type)) {
                console.warn(
                    `"${component.type}" component has allowMultiple set to ${component.allowMultiple}. Trying to add a "${component.type}" component to an entity which already has one.`
                );
                return false;
            }

            this.components[component.type] = component;

            Object.defineProperty(this, component.type, {
                enumerable: true,
                configurable: true,
                get() {
                    return this.components[component.type];
                },
            });

            component._onAttached(this);
            return true;
        }

        if (!component.keyProperty) {
            console.warn(
                `"${component.type}" component has allowMultiple set to ${component.allowMultiple}, but the "keyProperty" is not defined.`
            );
            return false;
        }

        if (!component.key) {
            console.warn(
                `"${component.type}" component has a falsy key of "${component.key}". The keyProperty is set to "${component.keyProperty}".`
            );
            return false;
        }

        if (!this.components[component.type]) {
            this.components[component.type] = {};
            Object.defineProperty(this, component.type, {
                configurable: true,
                enumerable: true,
                get() {
                    return this.components[component.type];
                },
            });
        }

        this.components[component.type][component.key] = component;

        component._onAttached(this);

        return true;
    }

    owns(component) {
        return component.entity === this;
    }

    remove(typeOrClassOrComponent, key = null) {
        key =
            typeOrClassOrComponent instanceof Component
                ? typeOrClassOrComponent.key
                : key;
        const definition = this.ecs.components.get(typeOrClassOrComponent);

        if (definition.allowMultiple) {
            if (!key) {
                console.warn(
                    `Trying to remove a "${definition.type}" component which allows multiple without specifying an key.`
                );
                return;
            }

            const all = this.components[definition.type];
            const component = all[key];

            if (component) {
                delete all[key];
                component._onDetached();
                return component;
            } else {
                console.warn(
                    `Trying to remove a "${definition.type}" component from an entity at "${key}", but it wasn't found.`
                );
                return;
            }
        }

        if (definition.type in this) {
            const component = this.components[definition.type];

            delete this[definition.type];
            delete this.components[definition.type];
            component._onDetached();

            return component;
        }

        console.warn(
            `Trying to remove a "${definition.type}" component from an entity, but it wasn't found.`
        );
    }

    serialize() {
        return Object.entries(this.components).reduce(
            (o, [key, value]) => {
                if (value instanceof Component) {
                    return {
                        ...o,
                        [key]: value.serialize(),
                    };
                }

                return {
                    ...o,
                    [key]: Object.entries(value).reduce(
                        (o2, [k2, v2]) => ({
                            ...o2,
                            [k2]: v2.serialize(),
                        }),
                        {}
                    ),
                };
            },
            {
                id: this.id,
            }
        );
    }

    fireEvent(name, data) {
        const evt = new EntityEvent(name, data);

        for (const component of Object.values(this.components)) {
            if (component instanceof Component) {
                component._onEvent(evt);

                if (evt.prevented) {
                    return evt;
                }
            } else {
                for (const nestedComponent of Object.values(component)) {
                    nestedComponent._onEvent(evt);

                    if (evt.prevented) {
                        return evt;
                    }
                }
            }
        }

        return evt;
    }
}
